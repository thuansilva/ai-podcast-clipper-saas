"""Port (interface) the video processing pipeline uses to identify viral
moments from a transcript, regardless of which LLM backend is configured
(Gemini, Claude, ...) — see `core/moments_factory.py` for the selection logic.

Declared as a `typing.Protocol` on purpose: concrete adapters (and test
doubles) do not need to inherit from it, they just need to implement the
same method — same pattern as `core/storage/ports.py::ObjectStorage`.
"""

from typing import Protocol

from core.schemas import MomentsExtraction


class MomentsProvider(Protocol):
    """Extracts candidate viral clips from a transcript."""

    def identify_moments(self, transcript: list, genre: "str | None" = None) -> MomentsExtraction:
        """Returns the candidate clips identified from `transcript`.

        `genre` (RF-PIPE-GENRE) optionally steers which kind of moment is
        prioritized (see `core/moments.py::_GENRE_INSTRUCTIONS`). `None`, or
        any value a given adapter does not recognize, falls back to the
        generic behavior — never a silent provider-specific divergence.
        """
        ...
