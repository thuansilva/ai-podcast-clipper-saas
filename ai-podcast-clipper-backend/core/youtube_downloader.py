"""YouTube ingestion module using yt-dlp with S3 upload capabilities."""

import os
import shutil
import tempfile
from typing import Any, Optional

import boto3
import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError


class YouTubeDownloaderError(Exception):
    """Base exception for YouTube downloader errors."""
    pass


class YouTubeVideoUnavailableError(YouTubeDownloaderError):
    """Raised when a video is private, unavailable, removed, or not found."""
    pass


class YouTubeAgeRestrictedError(YouTubeDownloaderError):
    """Raised when a video is age-restricted and requires sign-in/bypass."""
    pass


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
    s3_bucket: str,
    s3_key: str,
    s3_client: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Downloads the highest quality MP4 stream up to 1080p and uploads directly to S3.

    Args:
        url: YouTube video URL.
        s3_bucket: Destination AWS S3 bucket.
        s3_key: Destination AWS S3 object key.
        s3_client: Optional boto3 S3 client. Created automatically if not provided.

    Returns:
        dict containing s3_key, duration (in seconds), title, and thumbnail URL.

    Raises:
        YouTubeVideoUnavailableError: If video is private or unavailable.
        YouTubeAgeRestrictedError: If video has an age restriction.
        YouTubeDownloaderError: If download, conversion, or S3 upload fails.
    """
    if not url or not url.strip():
        raise YouTubeVideoUnavailableError("A YouTube URL must be provided.")

    clean_url = url.strip()
    temp_dir = tempfile.mkdtemp(prefix="youtube_ingest_")

    try:
        target_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
        format_spec = (
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/"
            "best[height<=1080][ext=mp4]/best"
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

                # Upload file to S3
                client = s3_client if s3_client is not None else boto3.client("s3")
                try:
                    client.upload_file(local_video_path, s3_bucket, s3_key)
                except Exception as upload_err:
                    raise YouTubeDownloaderError(
                        f"Failed to upload video to S3 ({s3_bucket}/{s3_key}): {upload_err}"
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
