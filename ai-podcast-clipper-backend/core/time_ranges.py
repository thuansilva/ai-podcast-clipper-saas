"""Pure time-range math shared by the transcription module (manual-mode
audio transcription, `core/transcription.py`) and the YouTube downloader
(manual-mode partial download, `core/youtube_downloader.py`).

Nothing here depends on whisperx, yt-dlp, ffmpeg or any I/O: every function
takes/returns plain `(start, end)` tuples in seconds, so it can be unit
tested without mocking anything external.
"""

from typing import List, Tuple

# Safety margin (seconds) added before/after each manual cut when transcribing
# only the cut ranges: whisperx can lose or truncate a word that is cut in half
# at the very edge of the audio. The extra words are harmless because
# `generate_ass_subtitles` only keeps words overlapping the clip interval.
#
# Historical note: this constant and `merge_time_ranges` originally lived in
# `core/transcription.py` (manual-mode transcription only). They moved here
# so the YouTube downloader's manual-mode partial download (a second,
# independent consumer) can reuse the exact same merge logic instead of a
# parallel implementation. `core/transcription.py` re-exports both names
# unchanged, so existing imports (`from core.transcription import
# merge_time_ranges, RANGE_MARGIN_SECONDS`) keep working.
RANGE_MARGIN_SECONDS = 0.5


def merge_time_ranges(
    ranges: List[Tuple[float, float]],
    margin: float,
    duration: float,
) -> List[Tuple[float, float]]:
    """Expand each range by `margin` (clamped to [0, duration]), then merge
    overlapping/touching ranges. Returns them sorted. Merging guarantees that
    no audio (so no word) is transcribed twice."""
    expanded = sorted(
        (max(0.0, start - margin), min(duration, end + margin)) for start, end in ranges
    )
    merged: List[Tuple[float, float]] = []
    for start, end in expanded:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def build_range_offsets(
    merged_ranges: List[Tuple[float, float]],
) -> List[Tuple[float, float, float]]:
    """Given `merged_ranges` (sorted, non-overlapping — as returned by
    `merge_time_ranges`) in the exact order they were downloaded and then
    concatenated into a single output file, return
    `(original_start, original_end, offset_in_output)` for each range.

    `offset_in_output` is the cumulative duration of the *preceding* ranges:
    the second position of the tuple is where that range's first frame lands
    in the concatenated output. E.g. ranges of length 5s and 7s produce
    offsets `0.0` and `5.0`.
    """
    result: List[Tuple[float, float, float]] = []
    offset = 0.0
    for start, end in merged_ranges:
        result.append((start, end, offset))
        offset += end - start
    return result


def remap_cut_to_output(
    cut: Tuple[float, float],
    range_offsets: List[Tuple[float, float, float]],
) -> Tuple[float, float]:
    """Convert a single `(start, end)` cut — given in absolute seconds in the
    *original* video — into seconds in the concatenated output produced by
    downloading the ranges described by `range_offsets` (see
    `build_range_offsets`), in order.

    The cut must be fully contained in exactly one of the given ranges (true
    by construction when `range_offsets` was built by merging the very same
    cuts with `merge_time_ranges` — the margin only ever grows a range, never
    shrinks it). Raises `ValueError` otherwise, rather than silently
    returning a wrong time.
    """
    cut_start, cut_end = cut
    for original_start, original_end, offset_in_output in range_offsets:
        if original_start <= cut_start and cut_end <= original_end:
            shift = offset_in_output - original_start
            return (cut_start + shift, cut_end + shift)
    raise ValueError(
        f"Cut ({cut_start}, {cut_end}) is not contained in any of the given ranges: "
        f"{range_offsets}"
    )


def remap_cuts_to_output(
    cuts: List[Tuple[float, float]],
    range_offsets: List[Tuple[float, float, float]],
) -> List[Tuple[float, float]]:
    """`remap_cut_to_output` applied to every cut in `cuts`, preserving
    order. See `core/youtube_downloader.py::remap_manual_cuts` for the
    higher-level wrapper that also carries the cut's `title` through."""
    return [remap_cut_to_output(cut, range_offsets) for cut in cuts]
