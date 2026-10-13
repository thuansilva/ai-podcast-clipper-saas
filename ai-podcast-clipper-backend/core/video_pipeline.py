"""End-to-end video processing orchestration: transcribe, identify viral
moments, process each candidate clip.

Extracted from `main.py` as part of the pipeline consolidation (see
`AGENTS.md`). Both the Modal pipeline (`main.py`) and the local dev runner
(`local_server.py`) call `run_video_processing_pipeline` with their own
`WhisperTranscriber`/Gemini client instances — the orchestration logic
itself is shared, eliminating drift between environments.
"""

import json
import pathlib

from core.clip_pipeline import process_clip
from core.moments_port import MomentsProvider
from core.schemas import ProcessVideoRequest, ProcessVideoResponse
from core.storage.ports import ObjectStorage
from core.transcription import RANGE_MARGIN_SECONDS, WhisperTranscriber, merge_time_ranges
from core.video_probe import get_video_duration_seconds, validate_manual_cuts_against_duration


def resolve_input_video_path(
    s3_key: str,
    base_dir: pathlib.Path,
    storage: ObjectStorage,
) -> pathlib.Path:
    """Download the source video for `s3_key` into `base_dir/input.mp4`.

    The input video ALWAYS comes from the injected `storage` (S3 in
    production, MinIO in local dev). There is deliberately no local-file
    shortcut (RNF-SEC-19): the old `os.path.exists(s3_key)` -> `shutil.copy`
    branch let a caller holding AUTH_TOKEN pull any file of the container
    (e.g. `s3_key="/etc/passwd"`) into the pipeline. `s3_key` itself is also
    restricted to the formats the system generates at the contract
    (`core/schemas.py::ProcessVideoRequest`).
    """
    video_path = base_dir / "input.mp4"
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

    # 1. Transcription — subtitles depend on it even in manual mode
    # (RN-PIPE-MANUAL-08). Manual mode transcribes ONLY the audio of the cuts
    # (merged when they overlap, with a small safety margin), never the whole
    # video; automatic mode needs the full transcript for moment detection.
    if request.mode == "manual":
        ranges = merge_time_ranges(
            [(cut.start, cut.end) for cut in request.manual_cuts],
            margin=RANGE_MARGIN_SECONDS,
            duration=video_duration,
        )
        transcript_segments = []
        for range_start, range_end in ranges:
            print(f"Transcribing range {range_start}s-{range_end}s")
            transcript_segments.extend(
                json.loads(
                    transcriber.transcribe_range(base_dir, video_path, range_start, range_end)
                )
            )
        transcript_segments.sort(key=lambda word: word["start"])
    else:
        transcript_segments = json.loads(transcriber.transcribe(base_dir, video_path))

    if request.mode == "manual":
        # RN-PIPE-MANUAL-08/09: Gemini is skipped; every cut sent is processed,
        # clips_limit (automatic-only) does not apply.
        clips_to_process: list = request.manual_cuts
        print(f"Manual mode: processing {len(clips_to_process)} user-defined cuts")
    else:
        # 2. Identify moments for clips using the configured provider
        # (Gemini/Claude — core/moments_factory.py). `request.genre`
        # (RF-PIPE-GENRE) optionally steers which kind of moment is
        # prioritized; `None`/unrecognized values keep the generic behavior.
        print("Identifying clip moments...")
        moments_extraction = moments_provider.identify_moments(
            transcript_segments, genre=request.genre
        )
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
