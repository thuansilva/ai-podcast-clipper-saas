"""Real video duration probing (ffprobe) and manual-cut duration validation.

Spec: docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md
(section 5, RN-PIPE-MANUAL-06/07). The real duration of the source video is
only known after `resolve_input_video_path` downloads/copies it locally —
this cannot be validated inside `ProcessVideoRequest` (Pydantic), which is
evaluated before any handler runs.
"""

import pathlib
import subprocess
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from core.schemas import ManualCut


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
