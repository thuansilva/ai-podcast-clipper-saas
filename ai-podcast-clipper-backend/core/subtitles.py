"""Subtitle burning step of the clip pipeline (ffmpeg glue around
`core.subtitle_styles.generate_ass_subtitles`).

Split from `core/subtitle_styles.py` (which only deals with styling/.ass
generation, no subprocess calls) so the ffmpeg burn step can be shared
as-is by both the Modal pipeline (`main.py`) and the local dev runner
(`local_server.py`).
"""

import os
import subprocess

from core.subtitle_styles import generate_ass_subtitles


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
    subtitle_path = os.path.join(temp_dir, f"subtitles_{preset.lower()}.ass")

    generate_ass_subtitles(
        transcript_segments=transcript_segments,
        clip_start=clip_start,
        clip_end=clip_end,
        output_path=subtitle_path,
        preset=preset,
        max_words=max_words,
    )

    ffmpeg_cmd = (
        f'ffmpeg -y -i {clip_video_path} -vf "ass={subtitle_path}" '
        f'-c:v h264 -preset fast -crf 23 {output_path}'
    )
    subprocess.run(ffmpeg_cmd, shell=True, check=True)
