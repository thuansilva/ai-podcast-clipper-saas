"""Viral moment identification via Claude (Anthropic) forced tool-use,
functionally equivalent to core/moments.py's Gemini Structured Output
adapter. Selectable alongside Gemini via MOMENTS_PROVIDER=claude
(core/moments_factory.py) — added because Gemini occasionally returns
503 UNAVAILABLE under Google-side load.
"""

import json
import os

import anthropic

from core.moments import _IDENTIFY_MOMENTS_PROMPT_TEMPLATE
from core.schemas import MomentsExtraction

_MOMENTS_TOOL_NAME = "extract_viral_moments"


def identify_moments(transcript: list, claude_client: "anthropic.Anthropic | None" = None) -> MomentsExtraction:
    """Extract viral clips between 30-60 seconds from transcript using Claude forced tool-use."""
    prompt = _IDENTIFY_MOMENTS_PROMPT_TEMPLATE.format(
        transcript_json=json.dumps(transcript) if isinstance(transcript, (list, dict)) else str(transcript)
    )

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

    def identify_moments(self, transcript: list) -> MomentsExtraction:
        return identify_moments(transcript, claude_client=self.claude_client)
