"""Unit tests for the POST /process_video v2 request contract (mode manual vs. auto).

Spec: docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md
(sections 3, 7 and 10). Written in the RED phase of TDD: the ones that use
`ManualCut`, `mode`, `manual_cuts` or `extra="forbid"` must fail until
`core/schemas.py` implements the v2 contract.

`ManualCut` and the new constants are accessed through the `schemas` module
instead of imported by name, so that a missing symbol fails only the test that
needs it instead of aborting the whole pytest collection.
"""

from typing import Any, Dict, List

import pytest
from pydantic import ValidationError

from core import schemas
from core.schemas import ClipItem, ProcessVideoRequest
from tests.manual_cuts_fixture import FIXTURE_CUT_COUNT, load_manual_cuts_payload


def _legacy_payload() -> Dict[str, Any]:
    """Payload sent by callers that predate the v2 contract (only s3_key/preset)."""
    return {"s3_key": "uploads/user_123/8f14e45f/podcast.mp4", "preset": "HORMOZI"}


def _cuts(count: int, length: float = 5.0) -> List[Dict[str, Any]]:
    return [
        {"start": float(index), "end": float(index) + length}
        for index in range(count)
    ]


class TestProcessVideoRequestBackwardCompatibility:
    def test_legacy_payload_with_only_s3_key_and_preset_is_still_valid(self):
        # Green guard: this already works today and must keep working.
        request = ProcessVideoRequest.model_validate(_legacy_payload())
        assert request.s3_key == "uploads/user_123/8f14e45f/podcast.mp4"
        assert request.preset == "HORMOZI"

    def test_mode_defaults_to_auto_when_omitted(self):
        # RN-PIPE-MANUAL-14
        request = ProcessVideoRequest.model_validate(_legacy_payload())
        assert request.mode == "auto"

    def test_manual_cuts_default_to_none_when_omitted(self):
        request = ProcessVideoRequest.model_validate(_legacy_payload())
        assert request.manual_cuts is None


class TestProcessVideoRequestManualMode:
    def test_accepts_manual_payload_from_shared_fixture(self):
        # RN-PIPE-MANUAL-01: mode accepts "manual"; manual_cuts is carried over.
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        assert request.mode == "manual"
        assert request.manual_cuts is not None
        assert len(request.manual_cuts) == FIXTURE_CUT_COUNT
        assert request.manual_cuts[0].title == "Abertura"
        assert request.manual_cuts[0].start == 0.0
        assert request.manual_cuts[0].end == 4.0

    def test_manual_cut_without_title_is_accepted(self):
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        assert request.manual_cuts is not None
        assert request.manual_cuts[1].title is None

    @pytest.mark.parametrize("manual_cuts", [None, []], ids=["missing", "empty"])
    def test_manual_mode_without_cuts_is_rejected(self, manual_cuts):
        # RN-PIPE-MANUAL-02 / D5: never falls back to auto.
        payload = load_manual_cuts_payload()
        if manual_cuts is None:
            del payload["manual_cuts"]
        else:
            payload["manual_cuts"] = manual_cuts
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)

    def test_auto_mode_with_manual_cuts_is_rejected(self):
        # RN-PIPE-MANUAL-03: no ambiguous combination is resolved silently.
        payload = _legacy_payload()
        payload["mode"] = "auto"
        payload["manual_cuts"] = _cuts(1)
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)

    def test_mode_rejects_values_outside_auto_and_manual(self):
        # RN-PIPE-MANUAL-01: exactly two values. "face_focus" is a layout, not a mode (D6).
        payload = load_manual_cuts_payload()
        payload["mode"] = "face_focus"
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)

    def test_accepts_fifty_manual_cuts(self):
        # RN-PIPE-MANUAL-05 boundary: 50 is the maximum allowed.
        payload = load_manual_cuts_payload()
        payload["manual_cuts"] = _cuts(50)
        request = ProcessVideoRequest.model_validate(payload)
        assert request.manual_cuts is not None
        assert len(request.manual_cuts) == 50

    def test_rejects_more_than_fifty_manual_cuts(self):
        # RN-PIPE-MANUAL-05
        payload = load_manual_cuts_payload()
        payload["manual_cuts"] = _cuts(51)
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)


class TestProcessVideoRequestUnknownFields:
    def test_rejects_unknown_top_level_field(self):
        # RN-PIPE-MANUAL-13 / D2: extra="forbid", never silently dropped.
        payload = load_manual_cuts_payload()
        payload["video_url"] = "https://example.com/podcast.mp4"
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)

    def test_rejects_unknown_field_in_legacy_payload(self):
        payload = _legacy_payload()
        payload["unexpected"] = True
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)

    def test_rejects_unknown_field_inside_manual_cut(self):
        # ManualCut must also forbid extra keys (ManualCutDTO wire format is {title,start,end}).
        payload = load_manual_cuts_payload()
        payload["manual_cuts"][0]["virality_score"] = 9
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate(payload)


class TestProcessVideoRequestForwardCompatibilityFields:
    def test_accepts_aspect_ratio_auto_zoom_and_genre_without_effect(self):
        # RN-PIPE-MANUAL-12 / D1 / D3: accepted by the contract, no enum for aspect_ratio.
        payload = _legacy_payload()
        payload["aspect_ratio"] = "16:9"
        payload["auto_zoom"] = True
        payload["genre"] = "podcast"
        request = ProcessVideoRequest.model_validate(payload)
        assert request.aspect_ratio == "16:9"
        assert request.auto_zoom is True
        assert request.genre == "podcast"

    def test_forward_compat_fields_are_optional(self):
        request = ProcessVideoRequest.model_validate(_legacy_payload())
        assert request.aspect_ratio is None
        assert request.auto_zoom is None
        assert request.genre is None


class TestManualCutValidation:
    def test_accepts_valid_cut_with_title(self):
        cut = schemas.ManualCut(start=10.0, end=25.0, title="Pergunta")
        assert cut.start == 10.0
        assert cut.end == 25.0
        assert cut.title == "Pergunta"

    def test_accepts_cut_without_title(self):
        cut = schemas.ManualCut(start=10.0, end=25.0)
        assert cut.title is None

    @pytest.mark.parametrize(
        ("start", "end"),
        [(30.0, 30.0), (50.0, 20.0)],
        ids=["end_equal_start", "end_before_start"],
    )
    def test_rejects_end_not_greater_than_start(self, start, end):
        # RN-PIPE-MANUAL-04
        with pytest.raises(ValidationError):
            schemas.ManualCut(start=start, end=end)

    def test_rejects_cut_longer_than_sixty_seconds(self):
        # RN-PIPE-MANUAL-04: same limit as the automatic mode (ClipItem).
        with pytest.raises(ValidationError):
            schemas.ManualCut(start=0.0, end=60.5)

    def test_accepts_cut_of_exactly_sixty_seconds(self):
        # RN-PIPE-MANUAL-04 boundary.
        cut = schemas.ManualCut(start=0.0, end=60.0)
        assert cut.end - cut.start == 60.0

    def test_rejects_negative_start(self):
        with pytest.raises(ValidationError):
            schemas.ManualCut(start=-1.0, end=5.0)

    def test_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            schemas.ManualCut.model_validate(
                {"start": 1.0, "end": 5.0, "hook": "nope"}
            )


class TestClipItemDurationRuleUnchanged:
    def test_clip_item_still_rejects_duration_over_sixty_seconds(self):
        # Green guard for the refactor that extracts _validate_clip_duration:
        # the automatic mode must keep exactly the same rule.
        with pytest.raises(ValidationError) as exc_info:
            ClipItem(
                title="Too long",
                hook="hook",
                start=0.0,
                end=61.0,
                virality_score=5,
                reason="reason",
            )
        assert "exceeds maximum allowed duration of 60.0 seconds" in str(exc_info.value)

    def test_max_manual_cuts_constant_matches_frontend_limit(self):
        # RN-PIPE-MANUAL-05: same value as manual-cut.schema.ts on the frontend.
        assert schemas.MAX_MANUAL_CUTS == 50
