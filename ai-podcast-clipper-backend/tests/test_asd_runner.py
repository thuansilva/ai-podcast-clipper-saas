"""Tests for `core/asd_runner.py`, the launcher that runs the vendored
`asd/Columbia_test.py` (LR-ASD) with the compatibility fixes it needs on
current library versions, without editing `asd/` (git submodule).
"""

import json
import pathlib
import subprocess
import sys

import numpy
import pytest

from core import asd_runner
from core.asd_runner import (
    FACE_DETECTOR_WEIGHTS_GDRIVE_ID,
    FACE_DETECTOR_WEIGHTS_RELATIVE_PATH,
    apply_numpy_compat,
    ensure_face_detector_weights,
)

RUNNER_PATH = pathlib.Path(asd_runner.__file__)
FAKE_WEIGHTS_BYTES = b"\0" * 2_000_000


class TestApplyNumpyCompat:
    def test_restores_np_int_removed_in_numpy_2(self):
        had_int = "int" in numpy.__dict__
        saved = numpy.__dict__.pop("int", None)
        try:
            apply_numpy_compat()
            assert numpy.int is int
        finally:
            numpy.__dict__.pop("int", None)
            if had_int:
                numpy.int = saved

    def test_does_not_override_an_existing_attribute(self, monkeypatch):
        sentinel = object()
        monkeypatch.setattr(numpy, "int", sentinel, raising=False)

        apply_numpy_compat()

        assert numpy.int is sentinel


class TestEnsureFaceDetectorWeights:
    def test_downloads_with_gdown_api_when_missing(self, tmp_path):
        calls = []

        def fake_download(*, id, output, quiet):
            calls.append({"id": id, "output": output})
            pathlib.Path(output).write_bytes(FAKE_WEIGHTS_BYTES)
            return output

        weights = ensure_face_detector_weights(tmp_path, download=fake_download)

        assert weights == tmp_path / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
        assert weights.read_bytes() == FAKE_WEIGHTS_BYTES
        assert len(calls) == 1
        assert calls[0]["id"] == FACE_DETECTOR_WEIGHTS_GDRIVE_ID
        assert not pathlib.Path(calls[0]["output"]).exists()

    def test_does_not_download_when_weights_already_present(self, tmp_path):
        weights = tmp_path / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
        weights.parent.mkdir(parents=True)
        weights.write_bytes(FAKE_WEIGHTS_BYTES)

        def fail_download(**_):
            raise AssertionError("must not download")

        assert ensure_face_detector_weights(tmp_path, download=fail_download) == weights

    def test_redownloads_a_truncated_file(self, tmp_path):
        weights = tmp_path / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
        weights.parent.mkdir(parents=True)
        weights.write_bytes(b"<html>quota exceeded</html>")

        def fake_download(*, id, output, quiet):
            pathlib.Path(output).write_bytes(FAKE_WEIGHTS_BYTES)
            return output

        ensure_face_detector_weights(tmp_path, download=fake_download)

        assert weights.read_bytes() == FAKE_WEIGHTS_BYTES

    def test_failed_download_raises_actionable_error_and_leaves_no_file(self, tmp_path):
        def failing_download(*, id, output, quiet):
            return None

        with pytest.raises(RuntimeError, match="sfd_face.pth"):
            ensure_face_detector_weights(tmp_path, download=failing_download)

        weights_dir = (tmp_path / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH).parent
        assert list(weights_dir.iterdir()) == []


class TestRunnerEntrypoint:
    def test_runs_script_as_main_from_asd_dir_with_compat_applied(self, tmp_path):
        asd_dir = tmp_path / "asd"
        weights = asd_dir / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
        weights.parent.mkdir(parents=True)
        weights.write_bytes(FAKE_WEIGHTS_BYTES)
        (asd_dir / "helper.py").write_text("VALUE = 42\n")
        report = tmp_path / "report.json"
        (asd_dir / "Columbia_test.py").write_text(
            "import json, os, sys\n"
            "import numpy\n"
            "import helper\n"
            "if __name__ == '__main__':\n"
            "    out = sys.argv[sys.argv.index('--report') + 1]\n"
            "    json.dump({'argv': sys.argv, 'cwd': os.getcwd(),\n"
            "               'np_int': numpy.int is int, 'helper': helper.VALUE},\n"
            "              open(out, 'w'))\n"
        )

        result = subprocess.run(
            [sys.executable, str(RUNNER_PATH), "Columbia_test.py",
             "--videoName", "clip_0", "--report", str(report)],
            cwd=asd_dir,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
        data = json.loads(report.read_text())
        assert pathlib.Path(data["argv"][0]).name == "Columbia_test.py"
        assert data["argv"][1:] == ["--videoName", "clip_0", "--report", str(report)]
        assert pathlib.Path(data["cwd"]).resolve() == asd_dir.resolve()
        assert data["np_int"] is True
        assert data["helper"] == 42

    def test_script_failure_propagates_nonzero_exit(self, tmp_path):
        asd_dir = tmp_path / "asd"
        weights = asd_dir / FACE_DETECTOR_WEIGHTS_RELATIVE_PATH
        weights.parent.mkdir(parents=True)
        weights.write_bytes(FAKE_WEIGHTS_BYTES)
        (asd_dir / "Columbia_test.py").write_text("raise ValueError('boom')\n")

        result = subprocess.run(
            [sys.executable, str(RUNNER_PATH), "Columbia_test.py"],
            cwd=asd_dir,
            capture_output=True,
            text=True,
        )

        assert result.returncode != 0
        assert "ValueError: boom" in result.stderr
