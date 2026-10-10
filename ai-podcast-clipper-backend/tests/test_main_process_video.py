"""Unit test for the Modal endpoint wiring in main.py (process_video).

Spec section 6: the three callers (main.py, local_server.py and the pipeline
itself) must hand over the whole ProcessVideoRequest, so the auto/manual
decision lives only in core/video_pipeline.py. This test guards the Modal side.

Phase 1 (RED): main.py still calls run_video_processing_pipeline(s3_key=...,
preset=...), so `call_args.kwargs["request"]` raises KeyError until Phase 2.
"""

from unittest.mock import MagicMock

import pytest
from fastapi.security import HTTPAuthorizationCredentials

import main
from core.schemas import ProcessVideoRequest, ProcessVideoResponse
from main import AiPodcastClipper
from tests.manual_cuts_fixture import load_manual_cuts_payload

UnderlyingClipper = (
    AiPodcastClipper._get_user_cls()
    if hasattr(AiPodcastClipper, "_get_user_cls")
    else AiPodcastClipper
)


def _raw_process_video():
    """Return the plain function behind the Modal `@modal.fastapi_endpoint`.

    Under Modal the class attribute is a `PartialFunction` wrapper, which is
    not callable directly. `_get_raw_f()` is Modal's accessor for the original
    function (private API, hence the fallback for plain functions).
    """
    attribute = UnderlyingClipper.process_video
    getter = getattr(attribute, "_get_raw_f", None)
    return getter() if callable(getter) else attribute


def test_modal_process_video_forwards_full_request_to_shared_pipeline(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("AUTH_TOKEN", "test-secret")
    request: ProcessVideoRequest = ProcessVideoRequest.model_validate(
        load_manual_cuts_payload()
    )
    token = HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-secret")

    fake_clipper = MagicMock()
    fake_clipper.transcriber = MagicMock()
    fake_clipper.gemini_client = MagicMock()

    pipeline = MagicMock(
        return_value=ProcessVideoResponse(file_id=request.s3_key, clips=[])
    )
    monkeypatch.setattr(main, "run_video_processing_pipeline", pipeline)

    _raw_process_video()(fake_clipper, request, token)

    pipeline.assert_called_once()
    forwarded: ProcessVideoRequest = pipeline.call_args.kwargs["request"]
    assert forwarded is request
    assert forwarded.mode == "manual"
