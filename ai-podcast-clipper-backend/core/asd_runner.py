"""Launcher for the vendored LR-ASD script (`asd/Columbia_test.py`).

`asd/` is an external git submodule (Junhua-Liao/Light-ASD) that we don't
edit. On current library versions it breaks in ways that all surfaced only
as the generic "Tracks or scores not found for clip":
- its face detector (`model/faceDetector/s3fd/__init__.py`) downloads its
  weights at import time with `gdown --id ...`, a CLI flag removed in
  gdown 5 (and a bare `gdown` that isn't on PATH when the backend runs from
  a non-activated venv);
- `model/faceDetector/s3fd/box_utils.py` uses `np.int`, removed in NumPy
  1.24/2.x.

This launcher fixes both before running the script, so the submodule stays
pristine. It runs as a standalone script (`python core/asd_runner.py
Columbia_test.py <args>`, with cwd = the asd dir) and imports nothing from
`core`, so it works the same in the Modal image and in the local runner.
"""

import pathlib
import runpy
import sys
from typing import Callable, Optional

FACE_DETECTOR_WEIGHTS_GDRIVE_ID = "1KafnHz7ccT-3IyddBsL5yi2xGtxAKypt"
FACE_DETECTOR_WEIGHTS_RELATIVE_PATH = pathlib.Path("model/faceDetector/s3fd/sfd_face.pth")
# The real file is ~90MB; anything tiny is a Google Drive error page saved as .pth.
_MIN_WEIGHTS_BYTES = 1_000_000


def apply_numpy_compat() -> None:
    import numpy

    try:
        numpy.int
    except AttributeError:
        numpy.int = int


def ensure_face_detector_weights(
    asd_dir,
    download: Optional[Callable[..., Optional[str]]] = None,
) -> pathlib.Path:
    weights = pathlib.Path(asd_dir) / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
    if weights.is_file() and weights.stat().st_size >= _MIN_WEIGHTS_BYTES:
        return weights

    if download is None:
        import gdown

        download = gdown.download

    weights.parent.mkdir(parents=True, exist_ok=True)
    partial = weights.with_name(weights.name + ".part")
    try:
        download(id=FACE_DETECTOR_WEIGHTS_GDRIVE_ID, output=str(partial), quiet=False)
    finally:
        downloaded = partial.is_file() and partial.stat().st_size >= _MIN_WEIGHTS_BYTES
        if not downloaded:
            partial.unlink(missing_ok=True)
    if not downloaded:
        raise RuntimeError(
            f"Could not download the LR-ASD face detector weights ({weights.name}) "
            f"from Google Drive id {FACE_DETECTOR_WEIGHTS_GDRIVE_ID}. Download it "
            f"manually to {weights}."
        )
    partial.replace(weights)
    return weights


def run_columbia(script: str, script_args: list[str]) -> None:
    asd_dir = pathlib.Path.cwd().resolve()
    runner_dir = pathlib.Path(__file__).resolve().parent
    # Running this file as a script puts `core/` first on sys.path; drop it so
    # none of our modules can shadow what the vendored code imports.
    sys.path[:] = [p for p in sys.path if pathlib.Path(p or ".").resolve() != runner_dir]
    sys.path.insert(0, str(asd_dir))

    apply_numpy_compat()
    ensure_face_detector_weights(asd_dir)

    sys.argv = [script, *script_args]
    runpy.run_path(str(asd_dir / script), run_name="__main__")


def main(argv: Optional[list[str]] = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        sys.exit("usage: asd_runner.py <script.py> [script args...] (run with cwd = asd dir)")
    run_columbia(argv[0], argv[1:])


if __name__ == "__main__":
    main()
