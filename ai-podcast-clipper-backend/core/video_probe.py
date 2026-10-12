"""Real video duration probing (ffprobe) and manual-cut duration validation.

Spec: docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md
(section 5, RN-PIPE-MANUAL-06/07). The real duration of the source video is
only known after `resolve_input_video_path` downloads/copies it locally —
this cannot be validated inside `ProcessVideoRequest` (Pydantic), which is
evaluated before any handler runs.
"""

import json
import pathlib
import subprocess
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from core.schemas import ManualCut


def has_video_stream(video_path: pathlib.Path) -> bool:
    """Returns True if ffprobe reports at least one video stream with a
    positive (or unreported) duration in `video_path`; False otherwise.

    Guards against a video silently losing its video track somewhere in the
    pipeline — concretely, yt-dlp picking an HLS-only video format
    (`protocol=m3u8_native`) for a partial/time-ranged YouTube download (see
    `core.youtube_downloader._download_time_ranges_to_s3`), which produces an
    audio-only output file with exit code 0 and a normal container duration,
    so neither alone is enough to catch it.
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v",
            "-show_entries", "stream=codec_type,duration",
            "-of", "json",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return False

    for stream in payload.get("streams") or []:
        if stream.get("codec_type") != "video":
            continue
        duration_raw = stream.get("duration")
        if duration_raw in (None, "N/A"):
            # Some codecs/containers don't report a per-stream duration;
            # presence of a video stream (already filtered by
            # `-select_streams v`) is sufficient evidence on its own.
            return True
        try:
            if float(duration_raw) > 0:
                return True
        except ValueError:
            return True
    return False


def get_video_duration_seconds(video_path: pathlib.Path) -> float:
    """Probe the real duration (seconds) of a local video file via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


class ManualCutExceedsVideoDurationError(ValueError):
    """Raised when any manual cut's end timestamp exceeds the real duration
    of the source video, discovered only after download/probe."""


def validate_manual_cuts_against_duration(
    manual_cuts: List["ManualCut"], video_duration_seconds: float
) -> None:
    """Reject the whole request (RN-PIPE-MANUAL-06) if any single manual cut's
    `end` exceeds the real duration of the source video. Overlapping cuts are
    permitted (RN-PIPE-MANUAL-07) — no overlap check happens here."""
    for cut in manual_cuts:
        if cut.end > video_duration_seconds:
            raise ManualCutExceedsVideoDurationError(
                f"Manual cut end timestamp ({cut.end}s) exceeds the source "
                f"video duration ({video_duration_seconds:.2f}s)"
            )
