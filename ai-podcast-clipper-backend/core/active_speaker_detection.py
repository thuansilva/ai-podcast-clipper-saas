"""Active speaker detection via the vendored LR-ASD (Light-ASD) model.

The actual model code lives in `asd/` (git submodule, see `.gitmodules` at
the repo root, pinned to Junhua-Liao/Light-ASD). This module only wraps the
subprocess invocation of `asd/Columbia_test.py` and loads back the
pickled tracks/scores it produces, so both the Modal pipeline (`main.py`)
and the local dev runner (`local_server.py`) share the exact same
invocation instead of drifting.
"""

import pathlib
import pickle
import subprocess
import time


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
    columbia_command = (
        f"python Columbia_test.py --videoName {clip_name} "
        f"--videoFolder {str(base_dir)} "
        f"--pretrainModel weight/finetuning_TalkSet.model"
    )

    start_time = time.time()
    subprocess.run(columbia_command, cwd=asd_dir, shell=True)
    duration = time.time() - start_time
    print(f"Columbia LR-ASD script completed in {duration:.2f} seconds")

    clip_dir = base_dir / clip_name
    tracks_path = clip_dir / "pywork" / "tracks.pckl"
    scores_path = clip_dir / "pywork" / "scores.pckl"
    if not tracks_path.exists() or not scores_path.exists():
        raise FileNotFoundError("Tracks or scores not found for clip")

    with open(tracks_path, "rb") as f:
        tracks = pickle.load(f)

    with open(scores_path, "rb") as f:
        scores = pickle.load(f)

    return tracks, scores
