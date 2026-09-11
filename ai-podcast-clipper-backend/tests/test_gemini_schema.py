"""Unit tests for Gemini Structured Output schemas and validation."""

import json
import pytest
from pydantic import ValidationError
from unittest.mock import MagicMock

from core.schemas import (
    ClipItem,
    MomentsExtraction,
    ProcessVideoRequest,
    ProcessVideoResponse,
)
from main import AiPodcastClipper

UnderlyingClipper = (
    AiPodcastClipper._get_user_cls()
    if hasattr(AiPodcastClipper, "_get_user_cls")
    else AiPodcastClipper
)


class TestClipItemValidation:
    def test_valid_clip_item(self):
        clip = ClipItem(
            title="The 1% Rule",
            hook="If you only change this one habit...",
            start=10.0,
            end=45.0,
            virality_score=9,
            reason="High retention hook with actionable insight.",
        )
        assert clip.title == "The 1% Rule"
        assert clip.hook.startswith("If you")
        assert clip.start == 10.0
        assert clip.end == 45.0
        assert clip.end - clip.start == 35.0
        assert clip.virality_score == 9

    def test_end_before_start_raises_validation_error(self):
        with pytest.raises(ValidationError) as exc_info:
            ClipItem(
                title="Invalid Clip",
                hook="Invalid timing",
                start=50.0,
                end=20.0,
                virality_score=5,
                reason="End time is before start time.",
            )
        assert "end timestamp (20.0) must be greater than start timestamp (50.0)" in str(
            exc_info.value
        )

    def test_end_equal_to_start_raises_validation_error(self):
        with pytest.raises(ValidationError) as exc_info:
            ClipItem(
                title="Zero Duration",
                hook="Instant moment",
                start=30.0,
                end=30.0,
                virality_score=5,
                reason="Duration is zero seconds.",
            )
        assert "must be greater than start timestamp" in str(exc_info.value)

    def test_duration_exceeding_60s_raises_validation_error(self):
        with pytest.raises(ValidationError) as exc_info:
            ClipItem(
                title="Too Long Clip",
                hook="This story goes on forever",
                start=0.0,
                end=61.0,
                virality_score=7,
                reason="Exceeds 60 seconds maximum duration.",
            )
        assert "exceeds maximum allowed duration of 60.0 seconds" in str(exc_info.value)

    def test_duration_exactly_60s_is_valid(self):
        clip = ClipItem(
            title="Max Allowed Duration",
            hook="Right at the limit",
            start=10.0,
            end=70.0,
            virality_score=8,
            reason="Clip of exactly 60.0 seconds duration.",
        )
        assert clip.end - clip.start == 60.0

    @pytest.mark.parametrize("score", [1, 5, 10])
    def test_virality_score_within_bounds(self, score: int):
        clip = ClipItem(
            title="Boundary Test",
            hook="Hook text",
            start=5.0,
            end=25.0,
            virality_score=score,
            reason="Score within valid range.",
        )
        assert clip.virality_score == score

    @pytest.mark.parametrize("invalid_score", [0, -1, 11, 100])
    def test_virality_score_out_of_bounds_raises(self, invalid_score: int):
        with pytest.raises(ValidationError):
            ClipItem(
                title="Invalid Score",
                hook="Hook text",
                start=5.0,
                end=25.0,
                virality_score=invalid_score,
                reason="Score out of bounds.",
            )


class TestMomentsExtraction:
    def test_moments_extraction_from_json(self):
        raw_payload = json.dumps({
            "clips": [
                {
                    "title": "Habit Building",
                    "hook": "Do not skip this routine",
                    "start": 5.0,
                    "end": 35.0,
                    "virality_score": 9,
                    "reason": "Strong engagement question",
                },
                {
                    "title": "Mindset Shift",
                    "hook": "Why most people fail",
                    "start": 60.0,
                    "end": 105.0,
                    "virality_score": 8,
                    "reason": "Provocative statement",
                },
            ]
        })

        extraction = MomentsExtraction.model_validate_json(raw_payload)
        assert len(extraction.clips) == 2
        assert extraction.clips[0].title == "Habit Building"
        assert extraction.clips[1].virality_score == 8

    def test_moments_extraction_empty_list(self):
        raw_payload = '{"clips": []}'
        extraction = MomentsExtraction.model_validate_json(raw_payload)
        assert len(extraction.clips) == 0


class TestEndpointsSchemas:
    def test_process_video_request_defaults(self):
        req = ProcessVideoRequest(s3_key="podcasts/episode_1.mp4")
        assert req.s3_key == "podcasts/episode_1.mp4"
        assert req.preset == "HORMOZI"

    def test_process_video_request_custom_preset(self):
        req = ProcessVideoRequest(s3_key="podcasts/ep2.mp4", preset="NEON")
        assert req.preset == "NEON"

    def test_process_video_response(self):
        resp = ProcessVideoResponse(
            success=True,
            file_id="podcasts/ep1.mp4",
            clips=[
                {
                    "clip_index": 0,
                    "s3_key": "podcasts/clip_0.mp4",
                    "title": "Best Clip",
                    "virality_score": 9,
                }
            ],
        )
        assert resp.success is True
        assert len(resp.clips) == 1


class TestIdentifyMomentsIntegration:
    def test_identify_moments_uses_structured_schema(self):
        clipper = UnderlyingClipper()

        mock_gemini_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "clips": [
                {
                    "title": "How to Think Big",
                    "hook": "Everything you learned about goal setting is wrong",
                    "start": 15.0,
                    "end": 55.0,
                    "virality_score": 10,
                    "reason": "Inverted mental model with strong punchline",
                }
            ]
        })
        mock_gemini_client.models.generate_content.return_value = mock_response
        clipper.gemini_client = mock_gemini_client

        dummy_transcript = [
            {"start": 15.0, "end": 15.5, "word": "Everything"},
            {"start": 15.5, "end": 16.0, "word": "you"},
            {"start": 16.0, "end": 16.5, "word": "learned"},
        ]

        result = clipper.identify_moments(dummy_transcript)

        assert isinstance(result, MomentsExtraction)
        assert len(result.clips) == 1
        assert result.clips[0].title == "How to Think Big"
        assert result.clips[0].virality_score == 10

        # Verify generate_content config parameters
        call_args, call_kwargs = mock_gemini_client.models.generate_content.call_args
        config = call_kwargs.get("config")
        assert config is not None
        assert config.response_mime_type == "application/json"
        assert config.response_schema == MomentsExtraction

    def test_identify_moments_markdown_codeblock_fallback(self):
        clipper = UnderlyingClipper()
        mock_gemini_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = """```json
{
    "clips": [
        {
            "title": "Focus Habit",
            "hook": "One hour of deep work",
            "start": 2.0,
            "end": 35.0,
            "virality_score": 8,
            "reason": "Clear productivity tip"
        }
    ]
}
```"""
        mock_gemini_client.models.generate_content.return_value = mock_response
        clipper.gemini_client = mock_gemini_client

        result = clipper.identify_moments([])
        assert isinstance(result, MomentsExtraction)
        assert len(result.clips) == 1
        assert result.clips[0].title == "Focus Habit"
