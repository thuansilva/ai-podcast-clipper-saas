"""Unit tests for subtitle styles and .ass generator."""

import os
import tempfile
from unittest.mock import patch
import pytest
import pysubs2

from core.subtitle_styles import (
    generate_ass_subtitles,
    get_preset_style,
    SUPPORTED_PRESETS,
)
from main import create_subtitles_with_ffmpeg


@pytest.fixture
def sample_transcript():
    return [
        {"start": 10.0, "end": 10.4, "word": "Welcome"},
        {"start": 10.5, "end": 10.8, "word": "to"},
        {"start": 10.9, "end": 11.3, "word": "the"},
        {"start": 11.4, "end": 11.9, "word": "greatest"},
        {"start": 12.0, "end": 12.5, "word": "show"},
        {"start": 12.6, "end": 13.0, "word": "on"},
        {"start": 13.1, "end": 13.6, "word": "earth"},
    ]


class TestPresetStyles:
    def test_supported_presets_list(self):
        assert "HORMOZI" in SUPPORTED_PRESETS
        assert "MINIMAL" in SUPPORTED_PRESETS
        assert "NEON" in SUPPORTED_PRESETS

    def test_hormozi_style_attributes(self):
        style, is_uppercase = get_preset_style("HORMOZI")
        assert is_uppercase is True
        assert style.fontname == "Anton"
        assert style.fontsize == 140
        assert style.bold is True
        assert style.outline == 6.0
        # Yellow primary color
        assert style.primarycolor.r == 255
        assert style.primarycolor.g == 230
        assert style.primarycolor.b == 0

    def test_minimal_style_attributes(self):
        style, is_uppercase = get_preset_style("MINIMAL")
        assert is_uppercase is False
        assert style.fontname == "Arial"
        assert style.fontsize == 90
        assert style.bold is False
        assert style.outline == 1.5
        # White primary color
        assert style.primarycolor.r == 255
        assert style.primarycolor.g == 255
        assert style.primarycolor.b == 255

    def test_neon_style_attributes(self):
        style, is_uppercase = get_preset_style("NEON")
        assert is_uppercase is True
        assert style.fontname == "Anton"
        assert style.fontsize == 130
        # Cyan primary color
        assert style.primarycolor.r == 0
        assert style.primarycolor.g == 255
        assert style.primarycolor.b == 255

    def test_unsupported_preset_raises_error(self):
        with pytest.raises(ValueError) as exc_info:
            get_preset_style("UNKNOWN_STYLE")
        assert "Unsupported preset" in str(exc_info.value)

    def test_preset_case_insensitivity(self):
        style_lower, _ = get_preset_style("hormozi")
        style_upper, _ = get_preset_style("HORMOZI")
        assert style_lower.fontname == style_upper.fontname
        assert style_lower.primarycolor == style_upper.primarycolor


class TestGenerateAssSubtitles:
    def test_generate_hormozi_subtitles(self, sample_transcript):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "hormozi.ass")
            res_path = generate_ass_subtitles(
                transcript_segments=sample_transcript,
                clip_start=10.0,
                clip_end=15.0,
                output_path=out_file,
                preset="HORMOZI",
                max_words=4,
            )

            assert os.path.exists(res_path)
            subs = pysubs2.load(res_path)
            assert len(subs.events) == 2

            # Hormozi should be all uppercase
            assert subs.events[0].text == "WELCOME TO THE GREATEST"
            assert subs.events[1].text == "SHOW ON EARTH"

            # Check style name
            assert subs.events[0].style == "HORMOZI"

    def test_generate_minimal_subtitles_preserves_case(self, sample_transcript):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "minimal.ass")
            res_path = generate_ass_subtitles(
                transcript_segments=sample_transcript,
                clip_start=10.0,
                clip_end=15.0,
                output_path=out_file,
                preset="MINIMAL",
                max_words=5,
            )

            subs = pysubs2.load(res_path)
            assert len(subs.events) == 2
            assert subs.events[0].text == "Welcome to the greatest show"
            assert subs.events[1].text == "on earth"
            assert subs.events[0].style == "MINIMAL"

    def test_relative_timestamp_alignment(self, sample_transcript):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "timestamps.ass")
            clip_start = 10.0
            generate_ass_subtitles(
                transcript_segments=sample_transcript,
                clip_start=clip_start,
                clip_end=14.0,
                output_path=out_file,
                preset="HORMOZI",
                max_words=1,
            )

            subs = pysubs2.load(out_file)
            first_event = subs.events[0]
            # Word start was 10.0, clip_start is 10.0 -> rel start should be 0 ms
            assert first_event.start == 0

    def test_clip_boundaries_filter_out_of_range_words(self):
        full_transcript = [
            {"start": 1.0, "end": 2.0, "word": "BeforeClip"},
            {"start": 10.5, "end": 11.0, "word": "InsideClip"},
            {"start": 50.0, "end": 51.0, "word": "AfterClip"},
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "filtered.ass")
            generate_ass_subtitles(
                transcript_segments=full_transcript,
                clip_start=10.0,
                clip_end=20.0,
                output_path=out_file,
                preset="HORMOZI",
            )
            subs = pysubs2.load(out_file)
            assert len(subs.events) == 1
            assert subs.events[0].text == "INSIDECLIP"

    def test_empty_transcript_creates_valid_empty_ass_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_file = os.path.join(tmpdir, "empty.ass")
            res_path = generate_ass_subtitles(
                transcript_segments=[],
                clip_start=0.0,
                clip_end=30.0,
                output_path=out_file,
                preset="HORMOZI",
            )
            assert os.path.exists(res_path)
            subs = pysubs2.load(res_path)
            assert len(subs.events) == 0

    def test_create_parent_directories_if_not_existing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            deep_path = os.path.join(tmpdir, "nested", "sub", "test.ass")
            generate_ass_subtitles(
                transcript_segments=[],
                clip_start=0.0,
                clip_end=10.0,
                output_path=deep_path,
                preset="MINIMAL",
            )
            assert os.path.exists(deep_path)


class TestCreateSubtitlesWithFfmpeg:
    @patch("main.subprocess.run")
    def test_create_subtitles_delegates_to_ffmpeg(self, mock_run, sample_transcript):
        with tempfile.TemporaryDirectory() as tmpdir:
            clip_video = os.path.join(tmpdir, "clip.mp4")
            output_video = os.path.join(tmpdir, "out.mp4")

            create_subtitles_with_ffmpeg(
                transcript_segments=sample_transcript,
                clip_start=10.0,
                clip_end=14.0,
                clip_video_path=clip_video,
                output_path=output_video,
                preset="NEON",
            )

            mock_run.assert_called_once()
            called_cmd = mock_run.call_args[0][0]
            assert "ffmpeg" in called_cmd
            assert "-vf" in called_cmd
            assert "ass=" in called_cmd
            assert "subtitles_neon.ass" in called_cmd
