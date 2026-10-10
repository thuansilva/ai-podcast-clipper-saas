"""Subtitle burning step of the clip pipeline (ffmpeg glue around
`core.subtitle_styles.generate_ass_subtitles`).

Split from `core/subtitle_styles.py` (which only deals with styling/.ass
generation, no subprocess calls) so the ffmpeg burn step can be shared
as-is by both the Modal pipeline (`main.py`) and the local dev runner
(`local_server.py`).
"""

import os
import re
import subprocess

from core.subtitle_styles import generate_ass_subtitles

_UNSAFE_FILENAME_CHARS = re.compile(r"[^a-z0-9_]")


def _safe_preset_slug(preset: str) -> str:
    """File-name-safe slug for `preset` (defense in depth: the schema already
    restricts `preset` to an allowlist, but this function must never put raw
    caller-controlled text into a path)."""
    slug = _UNSAFE_FILENAME_CHARS.sub("", preset.strip().lower())
    return slug or "default"


def create_subtitles_with_ffmpeg(
    transcript_segments: list,
    clip_start: float,
    clip_end: float,
    clip_video_path: str,
    output_path: str,
    preset: str = "HORMOZI",
    max_words: int = 5,
) -> None:
    """Generate styled subtitles with a pysubs2 preset and burn them via ffmpeg."""
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, f"subtitles_{_safe_preset_slug(preset)}.ass")

    generate_ass_subtitles(
        transcript_segments=transcript_segments,
        clip_start=clip_start,
        clip_end=clip_end,
        output_path=subtitle_path,
        preset=preset,
        max_words=max_words,
    )

    # Argument list + shell=False: no shell ever parses these values, so shell
    # metacharacters in any of them are inert (RCE fix).
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", clip_video_path,
        "-vf", f"ass={subtitle_path}",
        "-c:v", "h264", "-preset", "fast", "-crf", "23",
        output_path,
    ]
    subprocess.run(ffmpeg_cmd, shell=False, check=True)
