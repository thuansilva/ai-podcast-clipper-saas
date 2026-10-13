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

from core.active_speaker_detection import run_active_speaker_detection
from core.s3_paths import compute_clip_output_s3_key
from core.schemas import ClipItem, ManualCut
from core.storage.ports import ObjectStorage
from core.subtitles import create_subtitles_with_ffmpeg
from core.vertical_video import create_vertical_video


def extract_clip_words(
    transcript_segments: list, clip_start: float, clip_end: float
) -> list[dict]:
    """Words of the clip as `{word, start, end}` with times RELATIVE to the clip.

    Same selection rule as `generate_ass_subtitles` (overlap with
    `[clip_start, clip_end]`, `word`/`text` key, blank or untimed items
    skipped), so the stored transcript matches the burned subtitles. Times are
    shifted so the clip video starts at 0 (what `clip-editor-modal` expects)
    and clamped to `[0, clip_end - clip_start]`.
    """
    duration = clip_end - clip_start
    words: list[dict] = []
    for segment in transcript_segments:
        seg_start = segment.get("start")
        seg_end = segment.get("end")
        if seg_start is None or seg_end is None:
            continue
        if not (float(seg_end) > clip_start and float(seg_start) < clip_end):
            continue
        word = str(segment.get("word") or segment.get("text") or "").strip()
        if not word:
            continue
        words.append({
            "word": word,
            "start": max(0.0, float(seg_start) - clip_start),
            "end": min(duration, float(seg_end) - clip_start),
        })
    return words


def process_clip(
    base_dir: pathlib.Path,
    original_video_path: pathlib.Path,
    s3_key: str,
    start_time: float,
    end_time: float,
    clip_index: int,
    transcript_segments: list,
    storage: ObjectStorage,
    preset: str = "HORMOZI",
    clip_item: ClipItem | ManualCut | None = None,
    asd_dir: str = "/asd",
) -> dict:
    """Process a single candidate clip end-to-end and upload it to S3.

    Returns the clip metadata dict (S3 key, timing, preset, `words` (clip-relative
    transcript, see `extract_clip_words`), and title/hook/
    virality_score/reason, whose shape depends on the origin of `clip_item`:

    - `ClipItem` (automatic/Gemini mode): title/hook/virality_score/reason all
      filled in (RN-PIPE-MANUAL-11).
    - `ManualCut` (manual mode): title is `clip_item.title` or a generated
      fallback ("Manual clip {N}", N 1-based); hook/virality_score/reason are
      `None` (RN-PIPE-MANUAL-10/11).
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

    # 4. Generate subtitles with chosen preset and burn to video, UNLESS the
    # user picked "Sem Legenda" (preset "NONE"): SUPPORTED_PRESETS in
    # core/subtitle_styles.py never included "NONE", so skipping this call is
    # the only way to honor that choice -- calling create_subtitles_with_ffmpeg
    # unconditionally would silently fall back to HORMOZI (get_preset_style's
    # fallback for any unrecognized preset) and burn subtitles the user asked
    # to not have.
    render_path = vertical_mp4_path
    if preset.strip().upper() != "NONE":
        create_subtitles_with_ffmpeg(
            transcript_segments=transcript_segments,
            clip_start=start_time,
            clip_end=end_time,
            clip_video_path=str(vertical_mp4_path),
            output_path=str(subtitle_output_path),
            preset=preset,
            max_words=5,
        )
        render_path = subtitle_output_path

    storage.upload_file(str(render_path), output_s3_key)

    clip_metadata = {
        "clip_index": clip_index,
        "s3_key": output_s3_key,
        "start": start_time,
        "end": end_time,
        "duration": duration,
        "preset": preset,
        "words": extract_clip_words(transcript_segments, start_time, end_time),
    }
    if isinstance(clip_item, ClipItem):
        clip_metadata.update({
            "title": clip_item.title,
            "hook": clip_item.hook,
            "virality_score": clip_item.virality_score,
            "reason": clip_item.reason,
        })
    elif isinstance(clip_item, ManualCut):
        clip_metadata.update({
            "title": clip_item.title or f"Manual clip {clip_index + 1}",
            "hook": None,
            "virality_score": None,
            "reason": None,
        })
    return clip_metadata
