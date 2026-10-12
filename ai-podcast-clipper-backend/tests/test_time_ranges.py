"""Unit tests for `core/time_ranges.py`.

`merge_time_ranges`/`RANGE_MARGIN_SECONDS` already had coverage via
`core/transcription.py`'s re-export (see `tests/test_transcription_ranges.py`,
unchanged by the move — that file is the regression guard for the move
itself). This file covers:

- The same `merge_time_ranges` behavior, imported directly from its new home
  (sanity check that the module itself, not just the re-export, is correct).
- `build_range_offsets`/`remap_cut_to_output`/`remap_cuts_to_output`, new
  pure functions used by `core/youtube_downloader.py` to convert manual
  cuts' absolute-in-original-video timestamps into timestamps in the
  smaller, concatenated video produced by downloading just the needed
  ranges (RF-PIPE-08 manual-mode partial download).
"""

import pytest

from core.time_ranges import (
    RANGE_MARGIN_SECONDS,
    build_range_offsets,
    merge_time_ranges,
    remap_cut_to_output,
    remap_cuts_to_output,
)


class TestMergeTimeRangesDirectImport:
    def test_module_constant_matches_documented_value(self):
        assert RANGE_MARGIN_SECONDS == 0.5

    def test_single_range_gets_margin_clamped_to_duration(self):
        assert merge_time_ranges([(0.0, 4.0)], margin=0.5, duration=4.2) == [(0.0, 4.2)]

    def test_overlapping_ranges_after_margin_are_merged(self):
        assert merge_time_ranges([(0.0, 4.0), (4.8, 8.0)], margin=0.5, duration=60.0) == [
            (0.0, 8.5)
        ]

    def test_unsorted_input_is_sorted_before_merging(self):
        assert merge_time_ranges([(50.0, 60.0), (10.0, 20.0)], margin=0.5, duration=100.0) == [
            (9.5, 20.5),
            (49.5, 60.5),
        ]


class TestBuildRangeOffsets:
    def test_single_range_starts_at_offset_zero(self):
        assert build_range_offsets([(2.0, 10.0)]) == [(2.0, 10.0, 0.0)]

    def test_offsets_accumulate_previous_durations(self):
        merged = [(0.0, 5.0), (10.0, 17.0), (30.0, 32.0)]
        assert build_range_offsets(merged) == [
            (0.0, 5.0, 0.0),
            (10.0, 17.0, 5.0),
            (30.0, 32.0, 12.0),
        ]

    def test_empty_ranges_returns_empty_list(self):
        assert build_range_offsets([]) == []


class TestRemapCutToOutput:
    def test_cut_inside_single_merged_range(self):
        # One merged range [0, 20] (e.g. two cuts close enough to merge),
        # offset 0 because it's the first (and only) range in the output.
        range_offsets = [(0.0, 20.0, 0.0)]
        assert remap_cut_to_output((5.0, 9.0), range_offsets) == (5.0, 9.0)

    def test_cut_inside_second_merged_range_shifts_by_offset(self):
        # Two merged ranges: [0, 10] lands at offset 0, [100, 110] lands
        # right after it, at offset 10, in the concatenated output.
        range_offsets = [(0.0, 10.0, 0.0), (100.0, 110.0, 10.0)]
        assert remap_cut_to_output((102.0, 108.0), range_offsets) == (12.0, 18.0)

    def test_cut_at_the_edge_of_the_margin_expanded_merged_range(self):
        # Two cuts (40-45 and 46-50) that overlapped once expanded by a 2s
        # margin collapse into a single merged range [38, 52] (from
        # merge_time_ranges([(40,45),(46,50)], margin=2, duration=1000)).
        # A cut exactly at the merged range's original boundary must still
        # resolve inside it, not fall through to "not found".
        range_offsets = [(38.0, 52.0, 0.0)]
        assert remap_cut_to_output((40.0, 45.0), range_offsets) == (2.0, 7.0)
        assert remap_cut_to_output((46.0, 50.0), range_offsets) == (8.0, 12.0)

    def test_cut_not_contained_in_any_range_raises(self):
        range_offsets = [(0.0, 10.0, 0.0)]
        with pytest.raises(ValueError):
            remap_cut_to_output((20.0, 25.0), range_offsets)


class TestRemapCutsToOutput:
    def test_multiple_cuts_across_different_merged_ranges_preserve_order(self):
        # Simulates the real flow: two groups of cuts far apart in the
        # original video, merged into two ranges, concatenated in order.
        original_cuts = [(102.0, 108.0), (1.0, 4.0), (7.0, 9.0)]
        range_offsets = [(0.0, 10.0, 0.0), (100.0, 110.0, 10.0)]

        result = remap_cuts_to_output(original_cuts, range_offsets)

        assert result == [(12.0, 18.0), (1.0, 4.0), (7.0, 9.0)]

    def test_end_to_end_with_real_merge_and_offsets(self):
        # Two manual cuts that, after a 2s margin, overlap and merge into a
        # single range; a third cut far away stays separate.
        cuts = [(40.0, 45.0), (46.0, 50.0), (200.0, 205.0)]
        merged = merge_time_ranges(cuts, margin=2.0, duration=1000.0)
        assert merged == [(38.0, 52.0), (198.0, 207.0)]

        range_offsets = build_range_offsets(merged)
        assert range_offsets == [(38.0, 52.0, 0.0), (198.0, 207.0, 14.0)]

        result = remap_cuts_to_output(cuts, range_offsets)
        assert result == [(2.0, 7.0), (8.0, 12.0), (16.0, 21.0)]
