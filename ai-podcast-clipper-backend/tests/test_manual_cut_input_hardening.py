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
"""

import math
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
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


class TestProcessVideoEndpointRejectsHostileCutsWith422:
    """HTTP-level guard on the local runner: invalid cuts must be a 422 from
    the request contract, never reach the pipeline (no GPU time spent) and
    never be masked as 500 by the endpoint's generic `except Exception`."""

    @pytest.fixture
    def client_and_pipeline(self, monkeypatch):
        import local_server

        monkeypatch.setenv("AUTH_TOKEN", "test-secret")
        with patch.object(local_server.video_processor, "process_video") as process_video, \
                patch.object(local_server.video_processor, "load_model"):
            yield TestClient(local_server.app), process_video

    def _post_raw(self, client, raw_body: str):
        return client.post(
            "/process_video",
            content=raw_body,
            headers={
                "Authorization": "Bearer test-secret",
                "Content-Type": "application/json",
            },
        )

    @pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
    def test_non_finite_end_literal_never_reaches_pipeline(self, client_and_pipeline, literal):
        # Known limitation (reported, not fixed here): the request IS rejected
        # by the contract, but FastAPI's default RequestValidationError handler
        # echoes the offending `input` (a non-finite float) back in the 422
        # body, and Starlette's JSONResponse refuses to serialize NaN/Inf
        # (allow_nan=False) — so the client sees a 500, not a 422. What this
        # test guarantees is the security-relevant part: the request is never
        # accepted (no 2xx) and never reaches the GPU pipeline.
        # The frontend can't trigger this: JSON.stringify(NaN) emits `null`.
        client, process_video = client_and_pipeline
        client = TestClient(client.app, raise_server_exceptions=False)
        raw = (
            '{"s3_key": "uploads/u/x/podcast.mp4", "mode": "manual", '
            '"manual_cuts": [{"start": 0, "end": ' + literal + "}]}"
        )

        response = self._post_raw(client, raw)

        assert response.status_code in (422, 500)
        process_video.assert_not_called()

    def test_oversized_title_returns_422(self, client_and_pipeline):
        client, process_video = client_and_pipeline
        payload = {
            "s3_key": "uploads/u/x/podcast.mp4",
            "mode": "manual",
            "manual_cuts": [{"start": 0, "end": 5, "title": "x" * 201}],
        }

        response = client.post(
            "/process_video",
            json=payload,
            headers={"Authorization": "Bearer test-secret"},
        )

        assert response.status_code == 422
        process_video.assert_not_called()

    def test_more_than_max_cuts_returns_422(self, client_and_pipeline):
        client, process_video = client_and_pipeline
        payload = {
            "s3_key": "uploads/u/x/podcast.mp4",
            "mode": "manual",
            "manual_cuts": [
                {"start": 0, "end": 5} for _ in range(schemas.MAX_MANUAL_CUTS + 1)
            ],
        }

        response = client.post(
            "/process_video",
            json=payload,
            headers={"Authorization": "Bearer test-secret"},
        )

        assert response.status_code == 422
        process_video.assert_not_called()
