"""YouTube ingestion module using yt-dlp with S3 upload capabilities."""

import os
import pathlib
import shutil
import subprocess
import tempfile
from typing import Any, List, Optional, Tuple
from urllib.parse import urlparse

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError, download_range_func

from core.storage.ports import ObjectStorage
from core.time_ranges import build_range_offsets, merge_time_ranges, remap_cuts_to_output
from core.video_probe import has_video_stream

# Margin (seconds) added before/after each requested time range before
# downloading just that range of the source video (manual-mode partial
# download, RF-PIPE-08). Deliberately larger than
# `core.time_ranges.RANGE_MARGIN_SECONDS` (0.5s — tuned only to avoid cutting
# a *transcribed word* in half): the downstream steps that consume this
# downloaded video (LR-ASD active-speaker detection, the vertical crop and
# subtitle burn-in, `core/asd_runner.py`/`core/clip_pipeline.py`) work with a
# sliding window of *frames* around each cut boundary, not just words, and
# benefit from a couple of spare seconds of real footage on each side rather
# than being handed a clip that starts/ends at the exact requested edge.
# yt-dlp's `force_keyframes_at_cuts` re-encodes to hit the requested boundary
# precisely (verified manually, see this task's report), so this margin is
# about processing headroom, not about avoiding corruption from an imprecise
# cut.
VIDEO_RANGE_MARGIN_SECONDS = 2.0


class YouTubeDownloaderError(Exception):
    """Base exception for YouTube downloader errors."""
    pass


class YouTubeVideoUnavailableError(YouTubeDownloaderError):
    """Raised when a video is private, unavailable, removed, or not found."""
    pass


class YouTubeAgeRestrictedError(YouTubeDownloaderError):
    """Raised when a video is age-restricted and requires sign-in/bypass."""
    pass


class YouTubeInvalidHostError(YouTubeDownloaderError):
    """Raised when a URL's host isn't youtube.com/youtu.be.

    Defense in depth against SSRF: yt-dlp's generic extractor will fetch
    whatever host it's given (including internal/metadata endpoints), so the
    host must be validated here even though callers upstream are expected to
    already validate it.
    """
    pass


_ALLOWED_YOUTUBE_HOSTS = ("youtube.com", "youtu.be")


def _assert_youtube_host(url: str) -> None:
    """Raises YouTubeInvalidHostError unless the URL's host is youtube.com/youtu.be
    (or a subdomain of one of those, e.g. www.youtube.com, m.youtube.com)."""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    hostname = (parsed.hostname or "").lower()
    is_allowed = any(
        hostname == allowed or hostname.endswith(f".{allowed}")
        for allowed in _ALLOWED_YOUTUBE_HOSTS
    )
    if not is_allowed:
        raise YouTubeInvalidHostError(
            f"URL host is not a YouTube domain (youtube.com/youtu.be): {url}"
        )


def _classify_download_error(e: Exception, url: str) -> YouTubeDownloaderError:
    """Classifies a yt-dlp exception into domain-specific exceptions."""
    msg = str(e).lower()
    if (
        "confirm your age" in msg
        or "age-restricted" in msg
        or "age restriction" in msg
        or "requires authentication" in msg
    ):
        return YouTubeAgeRestrictedError(
            f"YouTube video is age-restricted and cannot be downloaded: {url} ({e})"
        )
    if (
        "private video" in msg
        or "this video is private" in msg
    ):
        return YouTubeVideoUnavailableError(
            f"YouTube video is private: {url} ({e})"
        )
    if (
        "video unavailable" in msg
        or "not available" in msg
        or "does not exist" in msg
        or "removed by the uploader" in msg
        or "has been removed" in msg
    ):
        return YouTubeVideoUnavailableError(
            f"YouTube video is unavailable or does not exist: {url} ({e})"
        )
    return YouTubeDownloaderError(f"Failed to process YouTube video '{url}': {e}")


def get_youtube_video_info(url: str) -> dict[str, Any]:
    """
    Extracts metadata from a YouTube video without downloading media.

    Args:
        url: YouTube video URL.

    Returns:
        dict containing id, title, duration (in seconds), and thumbnail URL.

    Raises:
        YouTubeVideoUnavailableError: If video is private, unavailable, or URL is invalid.
        YouTubeAgeRestrictedError: If video has an age restriction.
        YouTubeDownloaderError: On other extraction failures.
    """
    if not url or not url.strip():
        raise YouTubeVideoUnavailableError("A YouTube URL must be provided.")

    clean_url = url.strip()
    _assert_youtube_host(clean_url)

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            if not info:
                raise YouTubeVideoUnavailableError(
                    f"No metadata returned for video URL: {clean_url}"
                )

            age_limit = info.get("age_limit", 0)
            if age_limit and age_limit > 0:
                raise YouTubeAgeRestrictedError(
                    f"YouTube video is age-restricted (age limit: {age_limit}): {clean_url}"
                )

            return {
                "id": str(info.get("id") or ""),
                "title": str(info.get("title") or ""),
                "duration": int(info.get("duration") or 0),
                "thumbnail": str(info.get("thumbnail") or ""),
            }
    except (YouTubeVideoUnavailableError, YouTubeAgeRestrictedError):
        raise
    except (DownloadError, ExtractorError) as e:
        raise _classify_download_error(e, clean_url) from e
    except Exception as e:
        raise YouTubeDownloaderError(
            f"Unexpected error extracting YouTube info for '{clean_url}': {e}"
        ) from e


def download_youtube_to_s3(
    url: str,
    s3_key: str,
    storage: ObjectStorage,
    time_ranges: Optional[List[Tuple[float, float]]] = None,
) -> dict[str, Any]:
    """
    Downloads the highest quality MP4 stream up to 1080p and uploads it
    through the injected `storage` (the central config, see
    `core/storage/factory.py`, is the only source of truth for the
    destination bucket/endpoint — never a parameter here).

    Args:
        url: YouTube video URL.
        s3_key: Destination object key.
        storage: Injected `ObjectStorage` the downloaded file is uploaded to.
        time_ranges: Optional list of `(start, end)` seconds, absolute in the
            *original* video (e.g. manual-mode cut timestamps). When
            given and non-empty, only the time range(s) covering them
            (merged with a safety margin, see `VIDEO_RANGE_MARGIN_SECONDS`)
            are downloaded and concatenated, in order, into a single output
            file uploaded to `s3_key` — never one file per range. When
            `None`/empty (the default), behavior is unchanged: the whole
            video is downloaded, exactly as before this parameter existed.

    Returns:
        dict containing `s3_key`, `duration` (seconds, always the *original*
        full video's duration — see `core/schemas.py::DownloadYouTubeResponse
        .duration`), `title`, and `thumbnail`. When `time_ranges` was given,
        also contains `remapped_ranges`: a list of
        `{original_start, original_end, offset_in_output}` dicts describing
        where each merged range landed in the concatenated output (see
        `remap_manual_cuts` to convert individual cuts using this mapping).
        Absent (not just `None`) when `time_ranges` was not given.

    Raises:
        YouTubeVideoUnavailableError: If video is private or unavailable.
        YouTubeAgeRestrictedError: If video has an age restriction.
        YouTubeDownloaderError: If download, conversion, or S3 upload fails.
    """
    if not url or not url.strip():
        raise YouTubeVideoUnavailableError("A YouTube URL must be provided.")

    clean_url = url.strip()
    _assert_youtube_host(clean_url)

    if time_ranges:
        return _download_time_ranges_to_s3(clean_url, s3_key, storage, time_ranges)

    temp_dir = tempfile.mkdtemp(prefix="youtube_ingest_")

    try:
        target_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
        # `[protocol^=https]` excludes HLS (`m3u8_native`) formats — see
        # `_download_time_ranges_to_s3`'s `format_spec` for the root-cause
        # bug this guards against. The whole-video download hasn't been
        # observed to hit it (the failure mode needs `download_ranges` +
        # `force_keyframes_at_cuts`, not used here), but the same
        # restriction is applied here too for consistency and defense in
        # depth: progressive HTTPS formats are the ones this pipeline is
        # built to handle, and the `best[...]/best` fallbacks still cover
        # videos without a progressive 1080p option.
        format_spec = (
            "bestvideo[height<=1080][ext=mp4][protocol^=https]+bestaudio[ext=m4a][protocol^=https]/"
            "best[height<=1080][ext=mp4][protocol^=https]/best"
        )
        ydl_opts = {
            "format": format_spec,
            "outtmpl": target_template,
            "merge_output_format": "mp4",
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=True)
                if not info:
                    raise YouTubeVideoUnavailableError(
                        f"No video information returned for: {clean_url}"
                    )

                age_limit = info.get("age_limit", 0)
                if age_limit and age_limit > 0:
                    raise YouTubeAgeRestrictedError(
                        f"YouTube video is age-restricted (age limit: {age_limit}): {clean_url}"
                    )

                # Locate downloaded output file
                expected_filename = ydl.prepare_filename(info)
                mp4_filename = os.path.splitext(expected_filename)[0] + ".mp4"

                local_video_path = None
                if os.path.isfile(expected_filename):
                    local_video_path = expected_filename
                elif os.path.isfile(mp4_filename):
                    local_video_path = mp4_filename
                else:
                    # Scan temp_dir for candidate video files
                    candidates = [
                        os.path.join(temp_dir, f)
                        for f in os.listdir(temp_dir)
                        if os.path.isfile(os.path.join(temp_dir, f))
                    ]
                    mp4_candidates = [f for f in candidates if f.endswith(".mp4")]
                    if mp4_candidates:
                        local_video_path = mp4_candidates[0]
                    elif candidates:
                        local_video_path = candidates[0]

                if not local_video_path or not os.path.exists(local_video_path):
                    raise YouTubeDownloaderError(
                        f"Downloaded video file not found in temp directory: {temp_dir}"
                    )

                # Upload file through the injected storage.
                try:
                    storage.upload_file(local_video_path, s3_key)
                except Exception as upload_err:
                    raise YouTubeDownloaderError(
                        f"Failed to upload video to S3 (key={s3_key}): {upload_err}"
                    ) from upload_err

                return {
                    "s3_key": s3_key,
                    "duration": int(info.get("duration") or 0),
                    "title": str(info.get("title") or ""),
                    "thumbnail": str(info.get("thumbnail") or ""),
                }
        except (YouTubeVideoUnavailableError, YouTubeAgeRestrictedError, YouTubeDownloaderError):
            raise
        except (DownloadError, ExtractorError) as e:
            raise _classify_download_error(e, clean_url) from e
        except Exception as e:
            raise YouTubeDownloaderError(
                f"Failed to download and ingest YouTube video '{clean_url}': {e}"
            ) from e

    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def _download_time_ranges_to_s3(
    clean_url: str,
    s3_key: str,
    storage: ObjectStorage,
    time_ranges: List[Tuple[float, float]],
) -> dict[str, Any]:
    """Manual-mode partial download: downloads only the given `time_ranges`
    (merged with margin) and concatenates them, in order, into a single
    output file uploaded to `s3_key`. See `download_youtube_to_s3` for the
    public contract; this is only ever reached from there, with host
    validation already done.

    An extra metadata-only request (`get_youtube_video_info`, `skip_download:
    True`) is made first to learn the real video duration: it is needed
    *before* building `download_ranges` (to clamp the margin at the edges of
    the video, same as `merge_time_ranges` does for transcription), so it
    cannot be deferred until the real download's `extract_info` call
    returns. This costs one extra, cheap (no media bytes) request to
    YouTube.
    """
    info_preview = get_youtube_video_info(clean_url)
    full_duration = float(info_preview.get("duration") or 0)

    merged_ranges = merge_time_ranges(
        time_ranges, margin=VIDEO_RANGE_MARGIN_SECONDS, duration=full_duration
    )
    range_offsets = build_range_offsets(merged_ranges)

    temp_dir = tempfile.mkdtemp(prefix="youtube_ingest_ranges_")

    try:
        target_template = os.path.join(
            temp_dir, "%(id)s_%(section_start)s_%(section_end)s.%(ext)s"
        )
        # `[protocol^=https]` excludes HLS (`m3u8_native`) video formats.
        # Root cause (see this task's report): without this restriction,
        # yt-dlp can pick an HLS video format (e.g. `vp09...` at 1080p,
        # protocol `m3u8_native`) as "best", and combining that with
        # `download_ranges` + `force_keyframes_at_cuts=True` below silently
        # produces an output file with *no video stream at all* (audio
        # only) — `ffmpeg`/yt-dlp both exit 0, so nothing short of
        # inspecting the actual streams (see `has_video_stream` below)
        # catches it. Restricting to `protocol^=https` forces a progressive
        # MP4 format (e.g. `137+140`) that `download_ranges` handles
        # correctly; the `best[...]/best` fallbacks still cover videos
        # without a progressive 1080p option.
        format_spec = (
            "bestvideo[height<=1080][ext=mp4][protocol^=https]+bestaudio[ext=m4a][protocol^=https]/"
            "best[height<=1080][ext=mp4][protocol^=https]/best"
        )
        ydl_opts = {
            "format": format_spec,
            "outtmpl": target_template,
            "merge_output_format": "mp4",
            "download_ranges": download_range_func(None, merged_ranges),
            "force_keyframes_at_cuts": True,
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=True)
                if not info:
                    raise YouTubeVideoUnavailableError(
                        f"No video information returned for: {clean_url}"
                    )

                age_limit = info.get("age_limit", 0)
                if age_limit and age_limit > 0:
                    raise YouTubeAgeRestrictedError(
                        f"YouTube video is age-restricted (age limit: {age_limit}): {clean_url}"
                    )

                requested_downloads = info.get("requested_downloads") or []
                if len(requested_downloads) != len(merged_ranges):
                    raise YouTubeDownloaderError(
                        f"Expected {len(merged_ranges)} downloaded range file(s) for "
                        f"'{clean_url}', got {len(requested_downloads)}"
                    )

                segment_paths = []
                for download_info in requested_downloads:
                    filepath = download_info.get("filepath")
                    if not filepath or not os.path.isfile(filepath):
                        raise YouTubeDownloaderError(
                            f"Downloaded range file not found: {filepath}"
                        )
                    segment_paths.append(filepath)

                concatenated_path = _concat_video_segments(temp_dir, segment_paths)

                # Defense in depth against the HLS-format bug above (and
                # any other way a video stream could go missing): never
                # hand a broken, audio-only file to the rest of the
                # pipeline. Without this check, this failure only surfaced
                # much later, as a generic "Tracks or scores not found"
                # error from LR-ASD active-speaker detection.
                if not has_video_stream(pathlib.Path(concatenated_path)):
                    raise YouTubeDownloaderError(
                        f"Downloaded video for '{clean_url}' has no video "
                        f"stream after downloading/concatenating time ranges "
                        f"(format_spec={format_spec!r}); the source format "
                        f"was likely HLS-only for this range."
                    )

                try:
                    storage.upload_file(concatenated_path, s3_key)
                except Exception as upload_err:
                    raise YouTubeDownloaderError(
                        f"Failed to upload video to S3 (key={s3_key}): {upload_err}"
                    ) from upload_err

                return {
                    "s3_key": s3_key,
                    # Always the original full video's duration, not the
                    # (smaller) concatenated file's — see
                    # DownloadYouTubeResponse.duration's docstring.
                    "duration": int(full_duration),
                    "title": str(info.get("title") or ""),
                    "thumbnail": str(info.get("thumbnail") or ""),
                    "remapped_ranges": [
                        {
                            "original_start": original_start,
                            "original_end": original_end,
                            "offset_in_output": offset_in_output,
                        }
                        for original_start, original_end, offset_in_output in range_offsets
                    ],
                }
        except (YouTubeVideoUnavailableError, YouTubeAgeRestrictedError, YouTubeDownloaderError):
            raise
        except (DownloadError, ExtractorError) as e:
            raise _classify_download_error(e, clean_url) from e
        except Exception as e:
            raise YouTubeDownloaderError(
                f"Failed to download time ranges for YouTube video '{clean_url}': {e}"
            ) from e
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def _concat_video_segments(temp_dir: str, segment_paths: List[str]) -> str:
    """Concatenates `segment_paths`, in order, into a single mp4 using
    ffmpeg's concat demuxer.

    Tries `-c copy` (stream copy: fast, no quality loss) first. Each segment
    was already re-encoded at its cut boundaries by yt-dlp's
    `force_keyframes_at_cuts`, so consecutive segments share compatible
    codec parameters and stream-copy concatenation reliably produces a
    correctly-timed, playable file (verified manually against a real
    YouTube video — see this feature's task report). Falls back to a full
    re-encode only if the stream-copy attempt fails.
    """
    list_path = os.path.join(temp_dir, "concat_list.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for path in segment_paths:
            # ffmpeg concat demuxer quoting: a literal `'` inside the path
            # is escaped as `'\''`. Paths here are our own temp files
            # (`%(id)s_%(section_start)s_%(section_end)s.%(ext)s` under a
            # `tempfile.mkdtemp` directory), never user-controlled, but this
            # is cheap insurance against an exotic video ID.
            escaped = path.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    output_path = os.path.join(temp_dir, "concatenated_output.mp4")

    copy_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy",
        output_path,
    ]
    result = subprocess.run(copy_cmd, capture_output=True)
    if result.returncode != 0 or not os.path.isfile(output_path):
        reencode_cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_path,
            output_path,
        ]
        result = subprocess.run(reencode_cmd, capture_output=True)
        if result.returncode != 0 or not os.path.isfile(output_path):
            stderr = result.stderr.decode(errors="replace") if result.stderr else ""
            raise YouTubeDownloaderError(
                f"ffmpeg concat failed for {len(segment_paths)} segment(s): {stderr}"
            )

    return output_path


def resolve_download_time_ranges(
    manual_cuts: Optional[List[Any]],
    slice_range: Optional[Any],
) -> Optional[List[Tuple[float, float]]]:
    """Builds the `time_ranges` argument for `download_youtube_to_s3` from a
    `DownloadYouTubeRequest`'s `manual_cuts`/`slice` fields.

    The two are mutually exclusive by construction (enforced by
    `DownloadYouTubeRequest`'s own `model_validator`), so this never needs to
    reconcile both at once:

    - `manual_cuts` non-empty -> one range per cut (RF-PIPE-08).
    - `slice` present (and `manual_cuts` absent) -> a single range covering
      the whole slice (RF "adicionar mais cortes" — IA sobre um novo slice).
    - Neither -> `None` (whole-video download, unchanged from before either
      field existed).

    Duck-typed on purpose (only `.start`/`.end` are accessed), same
    convention as `remap_manual_cuts` below, so this stays decoupled from
    `core.schemas`. Shared by `main.py` and `local_server.py` so the two
    runners never drift on this decision (pipeline-consolidation decision,
    see `AGENTS.md`).
    """
    if manual_cuts:
        return [(cut.start, cut.end) for cut in manual_cuts]
    if slice_range is not None:
        return [(slice_range.start, slice_range.end)]
    return None


def remap_manual_cuts(
    manual_cuts: List[Any],
    remapped_ranges: List[dict],
) -> List[dict]:
    """Converts each `manual_cuts` entry's absolute-in-original-video
    `start`/`end` into `new_start`/`new_end` in the smaller, concatenated
    video produced by `download_youtube_to_s3(..., time_ranges=...)`, using
    that call's `remapped_ranges` result.

    `manual_cuts` items only need `.start`/`.end` attributes (and, if
    present, `.title`, carried through unchanged) — in practice
    `core.schemas.ManualCut` instances, but duck-typed on purpose so this
    stays decoupled from that Pydantic model.

    This single implementation is shared by `main.py` and `local_server.py`
    (both call it the same way right after `download_youtube_to_s3`) so the
    two runners never drift on how a cut is remapped — consistent with this
    project's pipeline-consolidation decision for `core/`.
    """
    range_offsets = [
        (r["original_start"], r["original_end"], r["offset_in_output"]) for r in remapped_ranges
    ]
    cuts = [(cut.start, cut.end) for cut in manual_cuts]
    new_times = remap_cuts_to_output(cuts, range_offsets)
    return [
        {
            "original_start": cut.start,
            "original_end": cut.end,
            "new_start": new_start,
            "new_end": new_end,
            "title": getattr(cut, "title", None),
        }
        for cut, (new_start, new_end) in zip(manual_cuts, new_times)
    ]
