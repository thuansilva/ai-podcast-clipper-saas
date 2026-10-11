"""Unit tests for core/moments_factory.py::create_moments_provider — the
single source of truth for which MomentsProvider (Gemini vs. Claude) the
pipeline uses, mirroring core/storage/factory.py::create_object_storage.
"""

from unittest.mock import MagicMock

import pytest

from core.claude_moments import ClaudeMomentsProvider
from core.moments import GeminiMomentsProvider
from core.moments_factory import create_moments_provider


class TestDefaultProvider:
    def test_defaults_to_gemini_when_env_var_is_absent(self):
        provider = create_moments_provider(env={"GEMINI_API_KEY": "key"})
        assert isinstance(provider, GeminiMomentsProvider)


class TestGeminiProvider:
    def test_returns_gemini_provider_when_selected(self):
        provider = create_moments_provider(
            env={"MOMENTS_PROVIDER": "gemini", "GEMINI_API_KEY": "key"}
        )
        assert isinstance(provider, GeminiMomentsProvider)

    def test_raises_when_api_key_missing_and_no_client_injected(self):
        with pytest.raises(ValueError):
            create_moments_provider(env={"MOMENTS_PROVIDER": "gemini"})

    def test_raises_when_api_key_is_empty_string(self):
        with pytest.raises(ValueError):
            create_moments_provider(
                env={"MOMENTS_PROVIDER": "gemini", "GEMINI_API_KEY": ""}
            )

    def test_allows_missing_api_key_when_client_is_injected(self):
        mock_client = MagicMock()
        provider = create_moments_provider(
            env={"MOMENTS_PROVIDER": "gemini"}, gemini_client=mock_client
        )
        assert isinstance(provider, GeminiMomentsProvider)
        assert provider.gemini_client is mock_client


class TestClaudeProvider:
    def test_returns_claude_provider_when_selected(self):
        provider = create_moments_provider(
            env={"MOMENTS_PROVIDER": "claude", "ANTHROPIC_API_KEY": "key"}
        )
        assert isinstance(provider, ClaudeMomentsProvider)

    def test_raises_when_api_key_missing_and_no_client_injected(self):
        with pytest.raises(ValueError):
            create_moments_provider(env={"MOMENTS_PROVIDER": "claude"})

    def test_raises_when_api_key_is_empty_string(self):
        with pytest.raises(ValueError):
            create_moments_provider(
                env={"MOMENTS_PROVIDER": "claude", "ANTHROPIC_API_KEY": ""}
            )

    def test_allows_missing_api_key_when_client_is_injected(self):
        mock_client = MagicMock()
        provider = create_moments_provider(
            env={"MOMENTS_PROVIDER": "claude"}, claude_client=mock_client
        )
        assert isinstance(provider, ClaudeMomentsProvider)
        assert provider.claude_client is mock_client


class TestInvalidProvider:
    def test_raises_on_unknown_provider_value(self):
        with pytest.raises(ValueError):
            create_moments_provider(env={"MOMENTS_PROVIDER": "openai"})
