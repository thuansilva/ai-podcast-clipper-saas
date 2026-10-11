"""Single source of truth for which `MomentsProvider` adapter the pipeline
uses, built from environment config shared by `main.py` (Modal) and
`local_server.py` (local GPU runner) — mirrors `core/storage/factory.py`.

Env vars:
  - `MOMENTS_PROVIDER` (default `"gemini"`): exactly 2 valid values. Any
    other value is a `ValueError`, never a silent fallback.
      - `"gemini"` -> `GeminiMomentsProvider` (core/moments.py). Added
        because Gemini occasionally returns 503 UNAVAILABLE under
        Google-side load, and the pipeline needed a configurable fallback.
      - `"claude"` -> `ClaudeMomentsProvider` (core/claude_moments.py).
  - `GEMINI_API_KEY`: required (non-empty) for `"gemini"`, unless a
    `gemini_client` is injected directly (test/caller-provided instance).
  - `ANTHROPIC_API_KEY`: required (non-empty) for `"claude"`, unless a
    `claude_client` is injected directly.
"""

import os
from typing import Mapping

from core.claude_moments import ClaudeMomentsProvider
from core.moments import GeminiMomentsProvider
from core.moments_port import MomentsProvider


def create_moments_provider(
    env: Mapping[str, str] = os.environ,
    gemini_client=None,
    claude_client=None,
) -> MomentsProvider:
    provider = env.get("MOMENTS_PROVIDER", "gemini")

    if provider not in ("gemini", "claude"):
        raise ValueError(
            f"MOMENTS_PROVIDER has an unknown value: {provider!r}. "
            'Expected "gemini" or "claude".'
        )

    if provider == "gemini":
        if gemini_client is None and not env.get("GEMINI_API_KEY"):
            raise ValueError(
                'MOMENTS_PROVIDER="gemini" requires GEMINI_API_KEY to be set '
                "(or a gemini_client to be injected directly)."
            )
        return GeminiMomentsProvider(gemini_client=gemini_client)
    else:
        if claude_client is None and not env.get("ANTHROPIC_API_KEY"):
            raise ValueError(
                'MOMENTS_PROVIDER="claude" requires ANTHROPIC_API_KEY to be '
                "set (or a claude_client to be injected directly)."
            )
        return ClaudeMomentsProvider(claude_client=claude_client)
