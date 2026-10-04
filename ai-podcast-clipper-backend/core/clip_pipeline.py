"""Per-clip processing: cut, active speaker detection, vertical reframe,
subtitles, and upload to S3.

Extracted from `main.py` as part of the pipeline consolidation (see
`AGENTS.md`). Shared by the Modal pipeline and the local dev runner so the
only difference between environments is the deploy/infra layer (Modal
decorators/secrets vs. FastAPI + local env vars), not the processing logic.
"""

import pathlib
import shutil
import subprocess
import time

import boto3

from core.active_speaker_detection import run_active_speaker_detection
from core.s3_paths import compute_clip_output_s3_key
from core.schemas import ClipItem
from core.subtitles import create_subtitles_with_ffmpeg
from core.vertical_video import create_vertical_video


def process_clip(
    base_dir: pathlib.Path,
    original_video_path: pathlib.Path,
    s3_key: str,
    start_time: float,
    end_time: float,
    clip_index: int,
    transcript_segments: list,
    preset: str = "HORMOZI",
    clip_item: ClipItem | None = None,
    s3_bucket: str = "ai-podcast-clipper",
    asd_dir: str = "/asd",
) -> dict:
    """Process a single candidate clip end-to-end and upload it to S3.

    Returns the clip metadata dict (S3 key, timing, preset, and — when
    `clip_item` is provided — title/hook/virality_score/reason).
    """
    clip_name = f"clip_{clip_index}"
    output_s3_key = compute_clip_output_s3_key(s3_key, clip_name)
    print(f"Output S3 key: {output_s3_key}")

    clip_dir = base_dir / clip_name
    clip_dir.mkdir(parents=True, exist_ok=True)

    clip_segment_path = clip_dir / f"{clip_name}_segment.mp4"
    vertical_mp4_path = clip_dir / "pyavi" / "video_out_vertical.mp4"
    subtitle_output_path = clip_dir / "pyavi" / "video_with_subtitles.mp4"

    (clip_dir / "pywork").mkdir(exist_ok=True)
    pyframes_path = clip_dir / "pyframes"
    pyavi_path = clip_dir / "pyavi"
    audio_path = clip_dir / "pyavi" / "audio.wav"

    pyframes_path.mkdir(exist_ok=True)
    pyavi_path.mkdir(exist_ok=True)

    duration = end_time - start_time
    # 1. Cut ONLY the clip slice from the original video
    cut_command = (
        f"ffmpeg -y -i {original_video_path} -ss {start_time} -t {duration} "
        f"{clip_segment_path}"
    )
    subprocess.run(cut_command, shell=True, check=True, capture_output=True, text=True)

    # 2. Extract audio for LR-ASD from the cut segment
    extract_cmd = (
        f"ffmpeg -y -i {clip_segment_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
    )
    subprocess.run(extract_cmd, shell=True, check=True, capture_output=True)

    shutil.copy(clip_segment_path, base_dir / f"{clip_name}.mp4")

    # 3. LR-ASD (Columbia) runs ONLY on this specific 30-60s clip, not the full video
    tracks, scores = run_active_speaker_detection(clip_name, base_dir, asd_dir=asd_dir)

    cvv_start_time = time.time()
    create_vertical_video(
        tracks, scores, pyframes_path, pyavi_path, audio_path, vertical_mp4_path
    )
    print(
        f"Clip {clip_index} vertical video creation time: "
        f"{time.time() - cvv_start_time:.2f} seconds"
    )

    # 4. Generate subtitles with chosen preset and burn to video
    create_subtitles_with_ffmpeg(
        transcript_segments=transcript_segments,
        clip_start=start_time,
        clip_end=end_time,
        clip_video_path=str(vertical_mp4_path),
        output_path=str(subtitle_output_path),
        preset=preset,
        max_words=5,
    )

    s3_client = boto3.client("s3")
    s3_client.upload_file(str(subtitle_output_path), s3_bucket, output_s3_key)

    clip_metadata = {
        "clip_index": clip_index,
        "s3_key": output_s3_key,
        "start": start_time,
        "end": end_time,
        "duration": duration,
        "preset": preset,
    }
    if clip_item:
        clip_metadata.update({
            "title": clip_item.title,
            "hook": clip_item.hook,
            "virality_score": clip_item.virality_score,
            "reason": clip_item.reason,
        })
    return clip_metadata
