"""Unit tests for Claude-backed viral moment identification
(core/claude_moments.py) — the Anthropic alternative to core/moments.py's
Gemini implementation, selectable via MOMENTS_PROVIDER=claude
(core/moments_factory.py). The Anthropic client is always mocked; these
tests never call the real API.
"""

from unittest.mock import MagicMock

import pytest

from core.claude_moments import ClaudeMomentsProvider, identify_moments
from core.moments import _build_identify_moments_prompt
from core.schemas import MomentsExtraction

DUMMY_TRANSCRIPT = [{"start": 15.0, "end": 15.5, "word": "Everything"}]


def _tool_use_response(clips_payload: dict) -> MagicMock:
    tool_use_block = MagicMock()
    tool_use_block.type = "tool_use"
    tool_use_block.input = clips_payload

    response = MagicMock()
    response.content = [tool_use_block]
    return response


class TestIdentifyMoments:
    def test_uses_forced_tool_choice_with_moments_extraction_schema(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({
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

        dummy_transcript = [
            {"start": 15.0, "end": 15.5, "word": "Everything"},
        ]

        result = identify_moments(dummy_transcript, claude_client=mock_client)

        assert isinstance(result, MomentsExtraction)
        assert len(result.clips) == 1
        assert result.clips[0].title == "How to Think Big"
        assert result.clips[0].virality_score == 10

        call_args, call_kwargs = mock_client.messages.create.call_args
        tools = call_kwargs.get("tools")
        assert tools is not None
        assert len(tools) == 1
        assert tools[0]["input_schema"] == MomentsExtraction.model_json_schema()

        tool_choice = call_kwargs.get("tool_choice")
        assert tool_choice is not None
        assert tool_choice["type"] == "tool"
        assert tool_choice["name"] == tools[0]["name"]

    def test_empty_clips_list_is_valid(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        result = identify_moments([], claude_client=mock_client)

        assert isinstance(result, MomentsExtraction)
        assert result.clips == []

    def test_no_tool_use_block_returns_empty_extraction(self):
        mock_client = MagicMock()
        text_block = MagicMock()
        text_block.type = "text"
        response = MagicMock()
        response.content = [text_block]
        mock_client.messages.create.return_value = response

        result = identify_moments([], claude_client=mock_client)

        assert isinstance(result, MomentsExtraction)
        assert result.clips == []

    def test_default_client_is_built_lazily_when_none_injected(self, monkeypatch):
        created_clients = []

        class _FakeAnthropic:
            def __init__(self, api_key):
                self.api_key = api_key
                self.messages = MagicMock()
                self.messages.create.return_value = _tool_use_response({"clips": []})
                created_clients.append(self)

        monkeypatch.setattr("core.claude_moments.anthropic.Anthropic", _FakeAnthropic)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        result = identify_moments([])

        assert isinstance(result, MomentsExtraction)
        assert len(created_clients) == 1
        assert created_clients[0].api_key == "test-key"

    def test_model_defaults_to_claude_sonnet_5_5(self, monkeypatch):
        monkeypatch.delenv("CLAUDE_MODEL", raising=False)
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        identify_moments([], claude_client=mock_client)

        _, call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs["model"] == "claude-sonnet-5-5"

    def test_model_is_configurable_via_env_var(self, monkeypatch):
        monkeypatch.setenv("CLAUDE_MODEL", "claude-custom-model")
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        identify_moments([], claude_client=mock_client)

        _, call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs["model"] == "claude-custom-model"


class TestGenreSteering:
    """RF-PIPE-GENRE: core/claude_moments.py reuses
    core/moments.py::_build_identify_moments_prompt, so it is in parity with
    the Gemini provider (core/moments.py) by construction — see
    core/moments_factory.py."""

    @pytest.mark.parametrize(
        "genre,expected_snippet",
        [
            ("humor", "comedy/humor"),
            ("perguntas", "Q&A/interview"),
            ("jogos", "gaming"),
        ],
    )
    def test_known_genre_is_forwarded_into_the_claude_message_content(
        self, genre: str, expected_snippet: str
    ):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        identify_moments(DUMMY_TRANSCRIPT, claude_client=mock_client, genre=genre)

        _, call_kwargs = mock_client.messages.create.call_args
        prompt_sent = call_kwargs["messages"][0]["content"]
        assert expected_snippet in prompt_sent
        assert prompt_sent == _build_identify_moments_prompt(DUMMY_TRANSCRIPT, genre=genre)

    def test_genre_none_sends_the_same_prompt_as_omitting_it(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        identify_moments(DUMMY_TRANSCRIPT, claude_client=mock_client, genre=None)
        _, call_kwargs_explicit = mock_client.messages.create.call_args

        mock_client_2 = MagicMock()
        mock_client_2.messages.create.return_value = _tool_use_response({"clips": []})
        identify_moments(DUMMY_TRANSCRIPT, claude_client=mock_client_2)
        _, call_kwargs_default = mock_client_2.messages.create.call_args

        assert (
            call_kwargs_explicit["messages"][0]["content"]
            == call_kwargs_default["messages"][0]["content"]
        )

    def test_unknown_genre_does_not_change_the_prompt(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({"clips": []})

        identify_moments(DUMMY_TRANSCRIPT, claude_client=mock_client, genre="outros")
        _, call_kwargs = mock_client.messages.create.call_args

        mock_client_2 = MagicMock()
        mock_client_2.messages.create.return_value = _tool_use_response({"clips": []})
        identify_moments(DUMMY_TRANSCRIPT, claude_client=mock_client_2)
        _, call_kwargs_default = mock_client_2.messages.create.call_args

        assert (
            call_kwargs["messages"][0]["content"]
            == call_kwargs_default["messages"][0]["content"]
        )


class TestClaudeMomentsProviderGenre:
    def test_forwards_genre_to_the_module_level_function(self, monkeypatch):
        captured = {}

        def fake_identify_moments(transcript, claude_client=None, genre=None):
            captured["transcript"] = transcript
            captured["claude_client"] = claude_client
            captured["genre"] = genre
            return MomentsExtraction(clips=[])

        monkeypatch.setattr("core.claude_moments.identify_moments", fake_identify_moments)

        provider = ClaudeMomentsProvider(claude_client="dummy-client")
        provider.identify_moments(DUMMY_TRANSCRIPT, genre="perguntas")

        assert captured["transcript"] == DUMMY_TRANSCRIPT
        assert captured["claude_client"] == "dummy-client"
        assert captured["genre"] == "perguntas"


class TestClaudeMomentsProvider:
    def test_identify_moments_delegates_to_module_function(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _tool_use_response({
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
        })

        provider = ClaudeMomentsProvider(claude_client=mock_client)
        result = provider.identify_moments([{"start": 1.0, "end": 1.5, "word": "x"}])

        assert isinstance(result, MomentsExtraction)
        assert result.clips[0].title == "Delegated Clip"
        mock_client.messages.create.assert_called_once()
