"""End-to-end video processing orchestration: transcribe, identify viral
moments, process each candidate clip.

Extracted from `main.py` as part of the pipeline consolidation (see
`AGENTS.md`). Both the Modal pipeline (`main.py`) and the local dev runner
(`local_server.py`) call `run_video_processing_pipeline` with their own
`WhisperTranscriber`/Gemini client instances — the orchestration logic
itself is shared, eliminating drift between environments.
"""

import json
import os
import pathlib
import shutil

import boto3

from core.clip_pipeline import process_clip
from core.moments import identify_moments
from core.schemas import ProcessVideoResponse
from core.transcription import WhisperTranscriber


def resolve_input_video_path(
    s3_key: str,
    base_dir: pathlib.Path,
    s3_bucket: str = "ai-podcast-clipper",
) -> pathlib.Path:
    """Resolve the local path of the source video for `s3_key`.

    If `s3_key` happens to already be a path that exists on the local
    filesystem (convenient for the local dev runner, which can point
    straight at a file on disk), it's copied as-is; otherwise it's
    downloaded from S3.
    """
    video_path = base_dir / "input.mp4"
    if os.path.exists(s3_key):
        shutil.copy(s3_key, str(video_path))
    else:
        s3_client = boto3.client("s3")
        s3_client.download_file(s3_bucket, s3_key, str(video_path))
    return video_path


def run_video_processing_pipeline(
    s3_key: str,
    preset: str,
    base_dir: pathlib.Path,
    transcriber: WhisperTranscriber,
    gemini_client=None,
    clips_limit: int = 5,
    s3_bucket: str = "ai-podcast-clipper",
    asd_dir: str = "/asd",
) -> ProcessVideoResponse:
    """Run the full pipeline (download/transcribe/identify moments/process
    clips) for a single source video and return the response payload."""
    video_path = resolve_input_video_path(s3_key, base_dir, s3_bucket=s3_bucket)

    # 1. Transcription
    transcript_segments_json = transcriber.transcribe(base_dir, video_path)
    transcript_segments = json.loads(transcript_segments_json)

    # 2. Identify moments for clips using structured schema
    print("Identifying clip moments with Gemini structured output...")
    moments_extraction = identify_moments(transcript_segments, gemini_client=gemini_client)
    clips_to_process = moments_extraction.clips[:clips_limit]
    print(f"Identified {len(clips_to_process)} candidate clips")

    # 3. Process clips (LR-ASD on cropped segments + vertical reframe + styled subtitles)
    processed_clips = []
    for index, clip_item in enumerate(clips_to_process):
        print(
            f"Processing clip {index} ({clip_item.title}): from "
            f"{clip_item.start}s to {clip_item.end}s"
        )
        clip_result = process_clip(
            base_dir=base_dir,
            original_video_path=video_path,
            s3_key=s3_key,
            start_time=clip_item.start,
            end_time=clip_item.end,
            clip_index=index,
            transcript_segments=transcript_segments,
            preset=preset,
            clip_item=clip_item,
            s3_bucket=s3_bucket,
            asd_dir=asd_dir,
        )
        processed_clips.append(clip_result)

    return ProcessVideoResponse(
        success=True,
        file_id=s3_key,
        clips=processed_clips,
    )
