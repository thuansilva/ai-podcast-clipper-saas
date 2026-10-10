"""RNF-SEC-07 — bearer token comparison must be constant-time.

The three auth checks (local_server.verify_auth_token, main.process_video and
main.download_youtube) used `token.credentials != os.environ.get("AUTH_TOKEN")`,
whose run time depends on how many leading characters match (timing attack).
They must go through `hmac.compare_digest`, while preserving the existing
semantics: wrong token -> 401, missing/empty AUTH_TOKEN -> 401 (never "open"),
empty bearer -> 401, and a non-ASCII bearer must be a clean 401 (str
`compare_digest` raises TypeError on non-ASCII, which would surface as a 500).
"""

import hmac
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import local_server
import main
from core.schemas import DownloadYouTubeRequest, ProcessVideoRequest, ProcessVideoResponse
from tests.manual_cuts_fixture import load_manual_cuts_payload

SECRET = "test-secret"


def _creds(value: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=value)


def _raw(attribute):
    for name in ("_get_raw_f", "get_raw_f"):
        getter = getattr(attribute, name, None)
        if callable(getter):
            return getter()
    return attribute


def _call_local_server(token: str) -> None:
    local_server.verify_auth_token(_creds(token))


def _call_main_process_video(token: str) -> None:
    clipper_cls = main.AiPodcastClipper
    if hasattr(clipper_cls, "_get_user_cls"):
        clipper_cls = clipper_cls._get_user_cls()
    request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
    fake_clipper = MagicMock()
    _raw(clipper_cls.process_video)(fake_clipper, request, _creds(token))


def _call_main_download_youtube(token: str) -> None:
    endpoint = main.download_youtube
    if hasattr(endpoint, "local"):
        endpoint = endpoint.local
    else:
        endpoint = _raw(endpoint)
    req = DownloadYouTubeRequest(url="https://www.youtube.com/watch?v=xyz")
    endpoint(request=req, token=_creds(token))


CALLERS = pytest.mark.parametrize(
    "call",
    [_call_local_server, _call_main_process_video, _call_main_download_youtube],
    ids=["local_server.verify_auth_token", "main.process_video", "main.download_youtube"],
)


@pytest.fixture(autouse=True)
def _stub_side_effects(monkeypatch: pytest.MonkeyPatch):
    """Authorized calls must not reach S3/GPU/yt-dlp."""
    monkeypatch.setattr(
        main,
        "run_video_processing_pipeline",
        MagicMock(return_value=ProcessVideoResponse(file_id="x", clips=[])),
    )
    monkeypatch.setattr(
        main,
        "download_youtube_to_s3",
        MagicMock(
            return_value={"s3_key": "youtube/x/original.mp4", "title": "t", "duration": 1, "thumbnail": None}
        ),
    )


@pytest.fixture
def compare_digest_spy(monkeypatch: pytest.MonkeyPatch):
    real = hmac.compare_digest
    spy = MagicMock(side_effect=real)
    monkeypatch.setattr(hmac, "compare_digest", spy)
    return spy


def _assert_401(call, token: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        call(token)
    assert exc_info.value.status_code == 401


@CALLERS
def test_correct_token_is_accepted_via_compare_digest(call, monkeypatch, compare_digest_spy):
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    call(SECRET)  # must not raise
    compare_digest_spy.assert_called()


@CALLERS
def test_wrong_token_is_rejected_via_compare_digest(call, monkeypatch, compare_digest_spy):
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    _assert_401(call, "wrong-token")
    compare_digest_spy.assert_called()


@CALLERS
def test_rejects_any_token_when_auth_token_not_configured(call, monkeypatch):
    monkeypatch.delenv("AUTH_TOKEN", raising=False)
    _assert_401(call, SECRET)
    _assert_401(call, "")


@CALLERS
def test_rejects_empty_token_when_auth_token_is_empty(call, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "")
    _assert_401(call, "")


@CALLERS
def test_non_ascii_token_is_rejected_with_401_not_500(call, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    _assert_401(call, "tést-secret")
