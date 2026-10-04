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


def identify_moments(transcript: list, gemini_client: "genai.Client | None" = None) -> MomentsExtraction:
    """Extract viral clips between 30-60 seconds from transcript using Gemini Structured Outputs."""
    import json

    prompt = _IDENTIFY_MOMENTS_PROMPT_TEMPLATE.format(
        transcript_json=json.dumps(transcript) if isinstance(transcript, (list, dict)) else str(transcript)
    )

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
