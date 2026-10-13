"""Unit tests for Gemini-backed viral moment identification
(core/moments.py).

RF-PIPE-GENRE: `genre` (one of the 4 `ProcessingOption` type=GENRE values
the frontend offers — "humor", "perguntas", "jogos", "outros" — or `None`/
any other value) optionally steers the moment-identification prompt. The
Gemini client is always mocked; these tests never call the real API.

`TestGenericPromptRegression` is the safety net for the pre-existing,
genre-less behavior: `genre=None`/"outros"/unknown must produce the exact
same prompt the pipeline sent before this field had any effect.
"""

import json
from unittest.mock import MagicMock

import pytest

from core.moments import (
    GeminiMomentsProvider,
    _IDENTIFY_MOMENTS_PROMPT_TEMPLATE,
    _build_identify_moments_prompt,
    identify_moments,
)
from core.schemas import MomentsExtraction

DUMMY_TRANSCRIPT = [
    {"start": 0.0, "end": 0.5, "word": "oi"},
    {"start": 0.5, "end": 1.0, "word": "pessoal"},
]


def _original_generic_prompt(transcript: list) -> str:
    """The exact prompt the pipeline produced before RF-PIPE-GENRE existed —
    computed straight from the untouched template, independent of whatever
    `_build_identify_moments_prompt` does, so it can't accidentally agree
    with a regression in that function."""
    return _IDENTIFY_MOMENTS_PROMPT_TEMPLATE.format(transcript_json=json.dumps(transcript))


def _structured_response(clips_payload: dict) -> MagicMock:
    response = MagicMock()
    response.text = json.dumps(clips_payload)
    return response


class TestGenericPromptRegression:
    """genre=None / "outros" / any unrecognized value -> zero behavior change."""

    def test_genre_none_is_byte_for_byte_identical_to_the_original_prompt(self):
        assert _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre=None) == (
            _original_generic_prompt(DUMMY_TRANSCRIPT)
        )

    def test_genre_omitted_defaults_to_the_same_prompt_as_explicit_none(self):
        assert _build_identify_moments_prompt(DUMMY_TRANSCRIPT) == (
            _original_generic_prompt(DUMMY_TRANSCRIPT)
        )

    def test_outros_genre_is_byte_for_byte_identical_to_the_original_prompt(self):
        assert _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre="outros") == (
            _original_generic_prompt(DUMMY_TRANSCRIPT)
        )

    def test_unknown_future_genre_falls_back_to_the_original_prompt(self):
        assert _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre="a-genre-from-the-future") == (
            _original_generic_prompt(DUMMY_TRANSCRIPT)
        )

    def test_identify_moments_sends_the_unmodified_generic_prompt_when_genre_is_none(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _structured_response({"clips": []})

        identify_moments(DUMMY_TRANSCRIPT, gemini_client=mock_client)

        _, call_kwargs = mock_client.models.generate_content.call_args
        assert call_kwargs["contents"] == _original_generic_prompt(DUMMY_TRANSCRIPT)


class TestGenreSteering:
    @pytest.mark.parametrize(
        "genre,expected_snippet",
        [
            ("humor", "comedy/humor"),
            ("perguntas", "Q&A/interview"),
            ("jogos", "gaming"),
        ],
    )
    def test_known_genre_adds_an_instruction_before_the_generic_rules(
        self, genre: str, expected_snippet: str
    ):
        prompt = _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre=genre)
        assert expected_snippet in prompt

        rules_index = prompt.index("Please adhere to the following rules:")
        genre_index = prompt.index(expected_snippet)
        assert genre_index < rules_index

    @pytest.mark.parametrize("genre", ["humor", "perguntas", "jogos"])
    def test_known_genre_still_contains_the_full_generic_prompt_around_it(self, genre: str):
        # The genre instruction is spliced in right before the rules list —
        # nothing from the original prompt (intro, rules, transcript) is
        # removed; it is only split in two by the inserted instruction.
        marker = "Please adhere to the following rules:"
        before_marker, after_marker = _original_generic_prompt(DUMMY_TRANSCRIPT).split(marker)

        prompt = _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre=genre)

        assert prompt.startswith(before_marker)
        assert prompt.endswith(after_marker)

    def test_known_genre_is_forwarded_into_the_gemini_request_contents(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _structured_response({"clips": []})

        identify_moments(DUMMY_TRANSCRIPT, gemini_client=mock_client, genre="humor")

        _, call_kwargs = mock_client.models.generate_content.call_args
        assert "comedy/humor" in call_kwargs["contents"]


class TestGeminiMomentsProvider:
    def test_identify_moments_delegates_to_module_function(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _structured_response(
            {
                "clips": [
                    {
                        "title": "Delegated Clip",
                        "hook": "hook",
                        "start": 1.0,
                        "end": 10.0,
                        "virality_score": 5,
                        "reason": "reason",
                    }
                ]
            }
        )

        provider = GeminiMomentsProvider(gemini_client=mock_client)
        result = provider.identify_moments(DUMMY_TRANSCRIPT)

        assert isinstance(result, MomentsExtraction)
        assert result.clips[0].title == "Delegated Clip"
        mock_client.models.generate_content.assert_called_once()

    def test_forwards_genre_to_the_module_level_function(self, monkeypatch):
        captured = {}

        def fake_identify_moments(transcript, gemini_client=None, genre=None):
            captured["transcript"] = transcript
            captured["gemini_client"] = gemini_client
            captured["genre"] = genre
            return MomentsExtraction(clips=[])

        monkeypatch.setattr("core.moments.identify_moments", fake_identify_moments)

        provider = GeminiMomentsProvider(gemini_client="dummy-client")
        provider.identify_moments(DUMMY_TRANSCRIPT, genre="jogos")

        assert captured["transcript"] == DUMMY_TRANSCRIPT
        assert captured["gemini_client"] == "dummy-client"
        assert captured["genre"] == "jogos"

    def test_genre_defaults_to_none_when_not_passed(self, monkeypatch):
        captured = {}

        def fake_identify_moments(transcript, gemini_client=None, genre=None):
            captured["genre"] = genre
            return MomentsExtraction(clips=[])

        monkeypatch.setattr("core.moments.identify_moments", fake_identify_moments)

        provider = GeminiMomentsProvider()
        provider.identify_moments(DUMMY_TRANSCRIPT)

        assert captured["genre"] is None
