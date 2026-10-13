"""In-memory test double for the `MomentsProvider` port (core/moments_port.py).

Mirrors `tests/storage_fakes.py::FakeObjectStorage`: records each call so
tests can assert on what the pipeline asked for, without talking to Gemini,
Claude or any other backend.
"""

from typing import List

from core.schemas import MomentsExtraction


class FakeMomentsProvider:
    """Records `identify_moments` calls and always returns `extraction`.

    `calls` keeps recording just the transcript (unchanged, pre-existing
    assertions rely on this shape). `genres` separately records the `genre`
    argument of each call, in the same order, so RF-PIPE-GENRE propagation
    tests can assert on it without touching the `calls` contract.
    """

    def __init__(self, extraction: MomentsExtraction) -> None:
        self.extraction = extraction
        self.calls: List[list] = []
        self.genres: List[object] = []

    def identify_moments(self, transcript: list, genre: object = None) -> MomentsExtraction:
        self.calls.append(transcript)
        self.genres.append(genre)
        return self.extraction
