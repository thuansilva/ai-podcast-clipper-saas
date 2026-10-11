"""In-memory test double for the `MomentsProvider` port (core/moments_port.py).

Mirrors `tests/storage_fakes.py::FakeObjectStorage`: records each call so
tests can assert on what the pipeline asked for, without talking to Gemini,
Claude or any other backend.
"""

from typing import List

from core.schemas import MomentsExtraction


class FakeMomentsProvider:
    """Records `identify_moments` calls and always returns `extraction`."""

    def __init__(self, extraction: MomentsExtraction) -> None:
        self.extraction = extraction
        self.calls: List[list] = []

    def identify_moments(self, transcript: list) -> MomentsExtraction:
        self.calls.append(transcript)
        return self.extraction
