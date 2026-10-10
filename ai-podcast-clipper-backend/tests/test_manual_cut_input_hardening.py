"""Security hardening of the `ManualCut` input contract (Phase 3 audit of the
POST /process_video v2 contract).

Spec: docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md

Gaps found in the audit and covered here:

1. `end = NaN` passed every check: `NaN <= start` and `NaN - start > 60` are
   both False, and later `NaN > video_duration` (core/video_probe.py) is also
   False — so a NaN cut slipped through the Pydantic contract AND the real
   duration check, burning GPU time (download + transcription) before failing
   deep inside ffmpeg with a 500. Python's `json` (used by FastAPI) accepts the
   non-standard `NaN`/`Infinity` literals, so this is reachable over HTTP.
2. `title` had no length limit on the backend, while the frontend Zod schema
   (`manual-cut.schema.ts`) caps it at 200 chars. The backend echoes the title
   back in the response, so an unbounded title inflates payload/DB rows.

The HTTP-level guard on the local runner (POST /process_video via
local_server.app) that exercises these same gaps lives in
tests/test_local_server.py instead of here: local_server.py does
compatibility monkey-patching of pyannote/whisperx/torch at import time
(even when imported lazily inside a fixture, as it originally was here), so
it can only be imported where torch/torchaudio are installed. This file is
collected by the lean `backend` CI job (only requirements-test.txt, no
torch); keeping that class here made those 3 tests error with
`ModuleNotFoundError: No module named 'uvicorn'` as soon as the fixture ran.
"""

import math

import pytest
from pydantic import ValidationError

from core import schemas
from core.schemas import ManualCut, ProcessVideoRequest

NON_FINITE_VALUES = [math.nan, math.inf, -math.inf]
NON_FINITE_IDS = ["nan", "inf", "-inf"]


class TestManualCutRejectsNonFiniteTimestamps:
    @pytest.mark.parametrize("value", NON_FINITE_VALUES, ids=NON_FINITE_IDS)
    def test_end_must_be_finite(self, value):
        with pytest.raises(ValidationError):
            ManualCut(start=0.0, end=value)

    @pytest.mark.parametrize("value", NON_FINITE_VALUES, ids=NON_FINITE_IDS)
    def test_start_must_be_finite(self, value):
        with pytest.raises(ValidationError):
            ManualCut(start=value, end=10.0)

    def test_nan_end_from_raw_json_is_rejected(self):
        # Pydantic's own JSON parser path (also used by some callers/tests).
        raw = '{"s3_key": "a.mp4", "mode": "manual", "manual_cuts": [{"start": 0, "end": NaN}]}'
        with pytest.raises(ValidationError):
            ProcessVideoRequest.model_validate_json(raw)

    def test_finite_cut_is_still_accepted(self):
        cut = ManualCut(start=1.5, end=10.0)
        assert cut.start == 1.5
        assert cut.end == 10.0


class TestManualCutTitleLength:
    def test_title_limit_matches_frontend_zod(self):
        # Same ceiling as `title: z.string().trim().min(1).max(200)` in
        # ai-podcast-clipper-frontend/src/domain/schemas/manual-cut.schema.ts
        assert schemas.MAX_MANUAL_CUT_TITLE_LENGTH == 200

    def test_title_at_limit_is_accepted(self):
        cut = ManualCut(start=0.0, end=5.0, title="x" * 200)
        assert cut.title is not None
        assert len(cut.title) == 200

    def test_title_over_limit_is_rejected(self):
        with pytest.raises(ValidationError):
            ManualCut(start=0.0, end=5.0, title="x" * 201)
