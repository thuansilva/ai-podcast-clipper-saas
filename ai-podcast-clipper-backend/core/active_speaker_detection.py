"""Active speaker detection via the vendored LR-ASD (Light-ASD) model.

The actual model code lives in `asd/` (git submodule, see `.gitmodules` at
the repo root, pinned to Junhua-Liao/Light-ASD). This module only wraps the
subprocess invocation of `asd/Columbia_test.py` (through `core/asd_runner.py`,
which applies the compatibility fixes the vendored code needs) and loads back
the pickled tracks/scores it produces, so both the Modal pipeline (`main.py`)
and the local dev runner (`local_server.py`) share the exact same
invocation instead of drifting.
"""

import pathlib
import pickle
import subprocess
import sys
import time

_ASD_RUNNER_PATH = pathlib.Path(__file__).resolve().with_name("asd_runner.py")


def run_active_speaker_detection(
    clip_name: str,
    base_dir: pathlib.Path,
    asd_dir: str = "/asd",
) -> tuple[list, list]:
    """Run Columbia_test.py (LR-ASD) against a clip and load its output.

    Expects `base_dir / clip_name` to already contain the cut clip
    (`{clip_name}.mp4` under `base_dir`, per Columbia_test.py's own
    `--videoFolder`/`--videoName` conventions) and writes its results under
    `base_dir / clip_name / pywork/{tracks,scores}.pckl`.

    Returns:
        (tracks, scores) loaded from the pickled output.

    Raises:
        FileNotFoundError: if Columbia_test.py didn't produce the expected
            pickle files (e.g. it crashed or `asd_dir` is wrong).
    """
    columbia_command = [
        sys.executable,
        str(_ASD_RUNNER_PATH),
        "Columbia_test.py",
        "--videoName",
        clip_name,
        "--videoFolder",
        str(base_dir),
        "--pretrainModel",
        "weight/finetuning_TalkSet.model",
    ]

    start_time = time.time()
    result = subprocess.run(columbia_command, cwd=asd_dir)
    duration = time.time() - start_time
    print(
        f"Columbia LR-ASD script completed in {duration:.2f} seconds "
        f"(exit code {result.returncode})"
    )

    clip_dir = base_dir / clip_name
    tracks_path = clip_dir / "pywork" / "tracks.pckl"
    scores_path = clip_dir / "pywork" / "scores.pckl"
    if not tracks_path.exists() or not scores_path.exists():
        # The script's last step (visualization) can fail after tracks/scores
        # are written, so a non-zero exit alone is not fatal.
        raise FileNotFoundError(
            f"Tracks or scores not found for clip {clip_name!r}: LR-ASD "
            f"(Columbia_test.py) exited with exit code {result.returncode}; "
            "see its traceback above in the backend log."
        )

    with open(tracks_path, "rb") as f:
        tracks = pickle.load(f)

    with open(scores_path, "rb") as f:
        scores = pickle.load(f)

    return tracks, scores
