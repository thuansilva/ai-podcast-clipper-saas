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

from core.clip_pipeline import process_clip
from core.moments_port import MomentsProvider
from core.schemas import ProcessVideoRequest, ProcessVideoResponse
from core.storage.ports import ObjectStorage
from core.transcription import WhisperTranscriber
from core.video_probe import get_video_duration_seconds, validate_manual_cuts_against_duration


def resolve_input_video_path(
    s3_key: str,
    base_dir: pathlib.Path,
    storage: ObjectStorage,
) -> pathlib.Path:
    """Resolve the local path of the source video for `s3_key`.

    If `s3_key` happens to already be a path that exists on the local
    filesystem (convenient for the local dev runner, which can point
    straight at a file on disk), it's copied as-is, without touching
    `storage`; otherwise it's downloaded through the injected `storage`.
    """
    video_path = base_dir / "input.mp4"
    if os.path.exists(s3_key):
        shutil.copy(s3_key, str(video_path))
    else:
        storage.download_file(s3_key, str(video_path))
    return video_path


def run_video_processing_pipeline(
    request: ProcessVideoRequest,
    base_dir: pathlib.Path,
    transcriber: WhisperTranscriber,
    storage: ObjectStorage,
    moments_provider: MomentsProvider,
    clips_limit: int = 5,
    asd_dir: str = "/asd",
) -> ProcessVideoResponse:
    """Run the full pipeline (download/transcribe/identify moments or manual
    cuts/process clips) for a single source video and return the response
    payload.

    `request.mode` is the single bifurcation point between the automatic
    (Gemini-driven) and manual (user-defined timestamps) paths — see
    docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md,
    section 6. `main.py`/`local_server.py` only forward `request` here, they
    never re-implement this decision.
    """
    s3_key = request.s3_key
    preset = request.preset
    video_path = resolve_input_video_path(s3_key, base_dir, storage=storage)

    if request.mode == "manual":
        # RN-PIPE-MANUAL-06: real duration is only known after download/probe.
        video_duration = get_video_duration_seconds(video_path)
        validate_manual_cuts_against_duration(request.manual_cuts, video_duration)

    # 1. Transcription always runs — subtitles depend on it even in manual mode
    # (RN-PIPE-MANUAL-08).
    transcript_segments_json = transcriber.transcribe(base_dir, video_path)
    transcript_segments = json.loads(transcript_segments_json)

    if request.mode == "manual":
        # RN-PIPE-MANUAL-08/09: Gemini is skipped; every cut sent is processed,
        # clips_limit (automatic-only) does not apply.
        clips_to_process: list = request.manual_cuts
        print(f"Manual mode: processing {len(clips_to_process)} user-defined cuts")
    else:
        # 2. Identify moments for clips using the configured provider
        # (Gemini/Claude — core/moments_factory.py)
        print("Identifying clip moments...")
        moments_extraction = moments_provider.identify_moments(transcript_segments)
        clips_to_process = moments_extraction.clips[:clips_limit]
        print(f"Identified {len(clips_to_process)} candidate clips")

    # 3. Process clips (LR-ASD on cropped segments + vertical reframe + styled subtitles)
    processed_clips = []
    for index, clip_item in enumerate(clips_to_process):
        print(f"Processing clip {index}: from {clip_item.start}s to {clip_item.end}s")
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
            storage=storage,
            asd_dir=asd_dir,
        )
        processed_clips.append(clip_result)

    return ProcessVideoResponse(
        success=True,
        file_id=s3_key,
        clips=processed_clips,
    )
