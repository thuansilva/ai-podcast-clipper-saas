"""Unit tests for range transcription (manual mode transcribes only the cuts).

whisperx and ffmpeg (subprocess.run) are mocked.
"""

import json
import pathlib
from unittest.mock import MagicMock

import pytest

from core import transcription
from core.transcription import WhisperTranscriber, merge_time_ranges


@pytest.fixture
def fake_whisperx(monkeypatch):
    fake = MagicMock()
    fake.load_audio.return_value = "audio-array"
    fake.align.return_value = {
        "word_segments": [
            {"start": 0.5, "end": 1.0, "word": "oi"},
            {"start": 2.0, "end": 2.5, "word": "mundo"},
        ]
    }
    monkeypatch.setattr(transcription, "whisperx", fake)
    return fake


@pytest.fixture
def run_mock(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(transcription.subprocess, "run", mock)
    return mock


@pytest.fixture
def transcriber():
    t = WhisperTranscriber()
    t.model = MagicMock()
    t.model.transcribe.return_value = {"segments": []}
    return t


class TestTranscribeRange:
    def test_extracts_only_the_range_with_argument_list(
        self, fake_whisperx, run_mock, transcriber, tmp_path
    ):
        video = tmp_path / "input.mp4"
        transcriber.transcribe_range(tmp_path, video, 100.0, 140.0)

        args, kwargs = run_mock.call_args
        cmd = args[0]
        assert isinstance(cmd, list)
        assert kwargs.get("shell", False) is False
        assert cmd[0] == "ffmpeg"
        assert cmd[cmd.index("-ss") + 1] == "100.0"
        assert cmd[cmd.index("-t") + 1] == "40.0"
        assert cmd[cmd.index("-i") + 1] == str(video)
        # -ss before -i (fast input seek)
        assert cmd.index("-ss") < cmd.index("-i")
        assert cmd[-1].startswith(str(tmp_path))

    def test_shifts_word_times_by_range_start(
        self, fake_whisperx, run_mock, transcriber, tmp_path
    ):
        result = json.loads(
            transcriber.transcribe_range(tmp_path, tmp_path / "input.mp4", 100.0, 140.0)
        )
        assert result == [
            {"start": 100.5, "end": 101.0, "word": "oi"},
            {"start": 102.0, "end": 102.5, "word": "mundo"},
        ]

    def test_audio_file_name_is_unique_per_range(
        self, fake_whisperx, run_mock, transcriber, tmp_path
    ):
        transcriber.transcribe_range(tmp_path, tmp_path / "i.mp4", 10.0, 20.0)
        transcriber.transcribe_range(tmp_path, tmp_path / "i.mp4", 30.0, 40.0)
        first = run_mock.call_args_list[0].args[0][-1]
        second = run_mock.call_args_list[1].args[0][-1]
        assert first != second

    def test_returns_empty_list_without_word_segments(
        self, fake_whisperx, run_mock, transcriber, tmp_path
    ):
        fake_whisperx.align.return_value = {}
        assert (
            json.loads(transcriber.transcribe_range(tmp_path, tmp_path / "i.mp4", 1.0, 2.0))
            == []
        )

    def test_skips_words_without_timestamps(
        self, fake_whisperx, run_mock, transcriber, tmp_path
    ):
        # whisperx omits start/end for tokens it could not align (e.g. numbers).
        fake_whisperx.align.return_value = {
            "word_segments": [{"word": "2024"}, {"start": 1.0, "end": 2.0, "word": "ok"}]
        }
        result = json.loads(
            transcriber.transcribe_range(tmp_path, tmp_path / "i.mp4", 10.0, 20.0)
        )
        assert result == [{"start": 11.0, "end": 12.0, "word": "ok"}]


class TestMergeTimeRanges:
    def test_adds_margin_clamped_to_zero_and_duration(self):
        assert merge_time_ranges([(0.0, 4.0)], margin=0.5, duration=4.2) == [(0.0, 4.2)]

    def test_merges_overlapping_and_touching(self):
        ranges = [(8.0, 12.0), (0.0, 4.0), (4.0, 9.5)]
        assert merge_time_ranges(ranges, margin=0.0, duration=60.0) == [(0.0, 12.0)]

    def test_merges_ranges_whose_margins_overlap(self):
        assert merge_time_ranges([(0.0, 4.0), (4.8, 8.0)], margin=0.5, duration=60.0) == [
            (0.0, 8.5)
        ]

    def test_keeps_distant_ranges_separate_and_sorted(self):
        assert merge_time_ranges([(50.0, 60.0), (10.0, 20.0)], margin=0.5, duration=100.0) == [
            (9.5, 20.5),
            (49.5, 60.5),
        ]
