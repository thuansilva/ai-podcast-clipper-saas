"""Viral moment identification via Claude (Anthropic) forced tool-use,
functionally equivalent to core/moments.py's Gemini Structured Output
adapter. Selectable alongside Gemini via MOMENTS_PROVIDER=claude
(core/moments_factory.py) — added because Gemini occasionally returns
503 UNAVAILABLE under Google-side load.
"""

import os

import anthropic

from core.moments import _build_identify_moments_prompt
from core.schemas import MomentsExtraction

_MOMENTS_TOOL_NAME = "extract_viral_moments"


def identify_moments(
    transcript: list,
    claude_client: "anthropic.Anthropic | None" = None,
    genre: "str | None" = None,
) -> MomentsExtraction:
    """Extract viral clips between 30-60 seconds from transcript using Claude forced tool-use.

    `genre` (RF-PIPE-GENRE) is forwarded to the shared prompt builder
    (`core.moments._build_identify_moments_prompt`) so this provider stays
    in parity with `core.moments.identify_moments` (Gemini) — see
    `core/moments_factory.py`.
    """
    prompt = _build_identify_moments_prompt(transcript, genre=genre)

    client = claude_client
    if client is None:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", "dummy_key"))

    response = client.messages.create(
        model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5"),
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
        tools=[
            {
                "name": _MOMENTS_TOOL_NAME,
                "description": "Records the extracted candidate viral clips from the transcript.",
                "input_schema": MomentsExtraction.model_json_schema(),
            }
        ],
        tool_choice={"type": "tool", "name": _MOMENTS_TOOL_NAME},
    )

    for block in response.content:
        if block.type == "tool_use":
            return MomentsExtraction.model_validate(block.input)

    return MomentsExtraction(clips=[])


class ClaudeMomentsProvider:
    """`MomentsProvider` (core/moments_port.py) adapter backed by Claude."""

    def __init__(self, claude_client: "anthropic.Anthropic | None" = None) -> None:
        self.claude_client = claude_client

    def identify_moments(self, transcript: list, genre: "str | None" = None) -> MomentsExtraction:
        return identify_moments(transcript, claude_client=self.claude_client, genre=genre)
