"""Regression tests for `core/active_speaker_detection.py`'s subprocess call.

Bug observed running `local_server.py` locally: `run_active_speaker_detection`
built the Columbia_test.py invocation as the literal string `"python
Columbia_test.py ..."` and ran it with `subprocess.run(..., shell=True)`. On
a machine where only `python3` is on PATH (no `python` alias — e.g. this
project's own `.venv`), the shell prints `python: not found`, the subprocess
exits non-zero, no pickle files are produced, and the function then raises
the misleading `FileNotFoundError: Tracks or scores not found for clip`
(which surfaces to the user as a 500 on `/process_video`).

The fix: invoke Columbia_test.py with `sys.executable` (the exact
interpreter already running this process, guaranteed to have the right
venv/packages) as an argument list, not a shell string — avoiding both the
PATH-dependent lookup and (as a side effect) a shell-injection surface.
"""

import pickle
import sys
from unittest.mock import patch

from core.active_speaker_detection import run_active_speaker_detection


class TestRunActiveSpeakerDetectionInvocation:
    def test_uses_current_python_interpreter_not_bare_python(self, tmp_path):
        clip_name = "clip_0"
        clip_dir = tmp_path / clip_name / "pywork"
        clip_dir.mkdir(parents=True)
        with open(clip_dir / "tracks.pckl", "wb") as f:
            pickle.dump([], f)
        with open(clip_dir / "scores.pckl", "wb") as f:
            pickle.dump([], f)

        with patch("core.active_speaker_detection.subprocess.run") as mock_run:
            run_active_speaker_detection(clip_name, tmp_path, asd_dir="/asd")

        args, kwargs = mock_run.call_args
        command = args[0]

        assert kwargs.get("shell") is not True
        assert isinstance(command, list)
        assert command[0] == sys.executable
        assert "python" == command[0] or command[0] != "python"
        assert "Columbia_test.py" in command

    def test_passes_videoname_and_videofolder_as_separate_args(self, tmp_path):
        clip_name = "clip_0"
        clip_dir = tmp_path / clip_name / "pywork"
        clip_dir.mkdir(parents=True)
        with open(clip_dir / "tracks.pckl", "wb") as f:
            pickle.dump([], f)
        with open(clip_dir / "scores.pckl", "wb") as f:
            pickle.dump([], f)

        with patch("core.active_speaker_detection.subprocess.run") as mock_run:
            run_active_speaker_detection(clip_name, tmp_path, asd_dir="/asd")

        command = mock_run.call_args[0][0]

        assert "--videoName" in command
        assert command[command.index("--videoName") + 1] == clip_name
        assert "--videoFolder" in command
        assert command[command.index("--videoFolder") + 1] == str(tmp_path)
        assert "--pretrainModel" in command
        assert (
            command[command.index("--pretrainModel") + 1]
            == "weight/finetuning_TalkSet.model"
        )
