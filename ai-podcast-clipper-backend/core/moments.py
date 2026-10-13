"""Viral moment identification via Gemini Structured Outputs.

Extracted from `main.py` as part of the pipeline consolidation (see
`AGENTS.md`): shared by the Modal pipeline and the local dev runner so both
use the exact same prompt/parsing logic.
"""

import os

from google import genai
from google.genai import types

from core.schemas import MomentsExtraction

_IDENTIFY_MOMENTS_PROMPT_TEMPLATE = """
This is a podcast video transcript consisting of words, along with each word's start and end time. I am looking to create clips between a minimum of 30 and maximum of 60 seconds long. The clip should never exceed 60 seconds.

Your task is to find and extract stories, hooks, questions and their corresponding answers from the transcript.
Each clip should begin with an engaging hook or question and conclude with the resolution or answer.
It is acceptable for the clip to include a few additional sentences before a question if it aids in contextualizing the question.

Please adhere to the following rules:
- Ensure that clips do not overlap with one another.
- Start and end timestamps of the clips should align perfectly with the sentence boundaries in the transcript.
- Only use the start and end timestamps provided in the input. Modifying timestamps is not allowed.
- Clip duration (end - start) must be strictly greater than 0 and less than or equal to 60.0 seconds.
- Provide a viral hook, title, virality_score (1 to 10), and reason for each clip.
- If there are no valid clips to extract, return an empty clips list: {{"clips": []}}.

The transcript is as follows:
{transcript_json}
"""

# Marker in `_IDENTIFY_MOMENTS_PROMPT_TEMPLATE` right before the generic
# rules list. Genre-specific guidance (`_GENRE_INSTRUCTIONS` below) is
# spliced in right before it, so it reads as an extra rule rather than a
# disconnected afterthought.
_RULES_MARKER = "Please adhere to the following rules:"

# RF-PIPE-GENRE: optional per-genre steering of viral moment identification.
# Keys are exactly the 4 values the frontend's `ProcessingOption` (type
# `GENRE`) offers (ai-podcast-clipper-frontend/prisma/seed.ts): "humor",
# "perguntas", "jogos", "outros". Deliberately NOT in this dict: "outros",
# `None`, and any unknown/future value — all of those fall through to the
# generic hook/question-answer prompt above, unchanged (regression-tested in
# tests/test_moments.py).
_GENRE_INSTRUCTIONS: dict[str, str] = {
    "humor": (
        "This podcast's genre is comedy/humor. Prioritize jokes, punchlines and "
        "moments of genuine laughter — a clip built around a strong joke or funny "
        "reaction is just as valid as one built around a question, and should be "
        "preferred over a weaker hook/question-answer moment."
    ),
    "perguntas": (
        "This podcast's genre is Q&A/interview. Reinforce the hook/question-answer "
        "structure above: strongly prefer clips that open with a clear, engaging "
        "question and conclude with its direct answer."
    ),
    "jogos": (
        "This podcast's genre is gaming. Prioritize reactions, hype moments and "
        "in-game highlights (plays, fails, wins) — a clip built around a big "
        "reaction or gameplay moment is just as valid as one built around a "
        "question, and should be preferred over a weaker hook/question-answer "
        "moment."
    ),
}


def _build_identify_moments_prompt(transcript: list, genre: "str | None" = None) -> str:
    """Build the moment-identification prompt for `transcript`, optionally
    steered by `genre`. Shared by both LLM providers (core/moments.py and
    core/claude_moments.py) so they stay in parity by construction instead
    of by convention — see core/moments_factory.py.

    `genre` outside `_GENRE_INSTRUCTIONS` (including `None`, `"outros"`, and
    any unrecognized value) leaves the prompt byte-for-byte identical to the
    original generic template — zero behavior change for those cases.
    """
    import json

    prompt = _IDENTIFY_MOMENTS_PROMPT_TEMPLATE.format(
        transcript_json=json.dumps(transcript) if isinstance(transcript, (list, dict)) else str(transcript)
    )

    genre_instruction = _GENRE_INSTRUCTIONS.get(genre or "")
    if genre_instruction:
        prompt = prompt.replace(
            _RULES_MARKER, genre_instruction + "\n\n" + _RULES_MARKER, 1
        )
    return prompt


def identify_moments(
    transcript: list,
    gemini_client: "genai.Client | None" = None,
    genre: "str | None" = None,
) -> MomentsExtraction:
    """Extract viral clips between 30-60 seconds from transcript using Gemini Structured Outputs.

    `genre` (RF-PIPE-GENRE) optionally steers which kind of moment the model
    prioritizes — see `_GENRE_INSTRUCTIONS`. `None`/unrecognized values keep
    the original generic behavior.
    """
    prompt = _build_identify_moments_prompt(transcript, genre=genre)

    client = gemini_client
    if client is None:
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy_key"))

    response = client.models.generate_content(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MomentsExtraction,
        ),
    )
    print(f"Identified moments response: {response.text}")
    if not response.text:
        return MomentsExtraction(clips=[])

    try:
        return MomentsExtraction.model_validate_json(response.text)
    except Exception:
        cleaned = response.text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-len("```")].strip()
        return MomentsExtraction.model_validate_json(cleaned)


class GeminiMomentsProvider:
    """`MomentsProvider` (core/moments_port.py) adapter backed by Gemini."""

    def __init__(self, gemini_client: "genai.Client | None" = None) -> None:
        self.gemini_client = gemini_client

    def identify_moments(self, transcript: list, genre: "str | None" = None) -> MomentsExtraction:
        return identify_moments(transcript, gemini_client=self.gemini_client, genre=genre)
