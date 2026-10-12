"""Unit tests for core/video_probe.py (real video duration via ffprobe).

Spec section 5 (RN-PIPE-MANUAL-06). `core.video_probe` does not exist yet, so
the module is imported inside each test: every test fails with
ModuleNotFoundError until Phase 2 creates it, without breaking collection.

ffprobe is mocked at `subprocess.run`: these are unit tests, no real video is
read here (real-file behaviour is covered by the integration tests in
tests/test_local_server.py).
"""

import importlib
import subprocess
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest

from core import schemas


def _probe():
    return importlib.import_module("core.video_probe")


def _cut(start: float, end: float):
    return schemas.ManualCut(start=start, end=end)


class TestHasVideoStream:
    """Unit tests for `has_video_stream` — guards against a video silently
    losing its video track (e.g. yt-dlp picking an HLS-only video format for
    a partial/time-ranged YouTube download, see
    `core.youtube_downloader._download_time_ranges_to_s3`). ffprobe is
    mocked at `subprocess.run`: no real video is read here."""

    def test_returns_true_when_a_video_stream_with_duration_is_present(
        self, tmp_path: Path
    ):
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout='{"streams": [{"codec_type": "video", "duration": "2.000000"}]}',
            stderr="",
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            assert probe.has_video_stream(tmp_path / "both.mp4") is True

    def test_returns_false_when_there_are_no_video_streams(self, tmp_path: Path):
        # The audio-only-file bug this guards against: ffprobe's
        # `-select_streams v` returns an empty streams list.
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='{"streams": []}', stderr=""
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            assert probe.has_video_stream(tmp_path / "audio_only.mp4") is False

    def test_returns_true_when_video_stream_has_no_duration_field(
        self, tmp_path: Path
    ):
        # Some codecs/containers don't report a per-stream duration; the
        # presence of a video stream (already filtered by
        # `-select_streams v`) is sufficient evidence on its own.
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout='{"streams": [{"codec_type": "video"}]}',
            stderr="",
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            assert probe.has_video_stream(tmp_path / "no_duration.mp4") is True

    def test_returns_false_when_video_stream_duration_is_zero(self, tmp_path: Path):
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout='{"streams": [{"codec_type": "video", "duration": "0.000000"}]}',
            stderr="",
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            assert probe.has_video_stream(tmp_path / "zero_duration.mp4") is False

    def test_returns_false_on_malformed_ffprobe_output(self, tmp_path: Path):
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="not json", stderr=""
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            assert probe.has_video_stream(tmp_path / "broken.mp4") is False

    def test_selects_only_video_streams_via_ffprobe_arguments(self, tmp_path: Path):
        probe = _probe()
        video_path = tmp_path / "input.mp4"
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='{"streams": []}', stderr=""
        )
        with patch(
            "core.video_probe.subprocess.run", return_value=completed
        ) as run:
            probe.has_video_stream(video_path)

        command: List[str] = run.call_args.args[0]
        assert command[0] == "ffprobe"
        assert "-select_streams" in command
        assert "v" in command
        assert str(video_path) in command


class TestGetVideoDurationSeconds:
    def test_parses_duration_from_ffprobe_stdout(self, tmp_path: Path):
        probe = _probe()
        video_path = tmp_path / "input.mp4"
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="15.040000\n", stderr=""
        )
        with patch("core.video_probe.subprocess.run", return_value=completed) as run:
            duration = probe.get_video_duration_seconds(video_path)

        assert duration == pytest.approx(15.04)
        command: List[str] = run.call_args.args[0]
        assert command[0] == "ffprobe"
        assert "format=duration" in command
        assert str(video_path) in command

    def test_strips_surrounding_whitespace_from_output(self, tmp_path: Path):
        probe = _probe()
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="  120.5 \n", stderr=""
        )
        with patch("core.video_probe.subprocess.run", return_value=completed):
            duration = probe.get_video_duration_seconds(tmp_path / "input.mp4")
        assert duration == pytest.approx(120.5)

    def test_ffprobe_failure_propagates_instead_of_returning_zero(self, tmp_path: Path):
        probe = _probe()
        error = subprocess.CalledProcessError(returncode=1, cmd=["ffprobe"])
        with patch("core.video_probe.subprocess.run", side_effect=error):
            with pytest.raises(subprocess.CalledProcessError):
                probe.get_video_duration_seconds(tmp_path / "corrupted.mp4")


class TestValidateManualCutsAgainstDuration:
    def test_error_class_is_a_value_error(self):
        probe = _probe()
        assert issubclass(probe.ManualCutExceedsVideoDurationError, ValueError)

    def test_accepts_cuts_within_video_duration(self):
        probe = _probe()
        probe.validate_manual_cuts_against_duration(
            [_cut(0.0, 4.0), _cut(4.0, 9.5)], video_duration_seconds=15.0
        )

    def test_accepts_cut_ending_exactly_at_video_duration(self):
        probe = _probe()
        probe.validate_manual_cuts_against_duration(
            [_cut(10.0, 15.0)], video_duration_seconds=15.0
        )

    def test_rejects_cut_whose_end_exceeds_video_duration(self):
        # RN-PIPE-MANUAL-06
        probe = _probe()
        with pytest.raises(probe.ManualCutExceedsVideoDurationError) as exc_info:
            probe.validate_manual_cuts_against_duration(
                [_cut(10.0, 20.0)], video_duration_seconds=15.0
            )
        message = str(exc_info.value)
        assert "20.0" in message
        assert "15.00" in message

    def test_rejects_whole_request_when_any_single_cut_is_out_of_range(self):
        # RN-PIPE-MANUAL-06: one bad cut rejects everything, nothing is processed silently.
        probe = _probe()
        cuts = [_cut(0.0, 4.0), _cut(12.0, 16.0), _cut(5.0, 9.0)]
        with pytest.raises(probe.ManualCutExceedsVideoDurationError):
            probe.validate_manual_cuts_against_duration(cuts, video_duration_seconds=15.0)

    def test_allows_overlapping_cuts(self):
        # RN-PIPE-MANUAL-07: overlap between manual cuts is permitted.
        probe = _probe()
        probe.validate_manual_cuts_against_duration(
            [_cut(0.0, 10.0), _cut(5.0, 15.0), _cut(5.0, 15.0)],
            video_duration_seconds=15.0,
        )
