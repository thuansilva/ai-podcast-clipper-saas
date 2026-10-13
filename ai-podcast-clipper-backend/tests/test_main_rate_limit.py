"""RNF-RL-03 — per-IP throttling on the Modal endpoints (`main.py`).

Integration level: the real, undecorated `main.process_video` /
`main.download_youtube` are mounted on a plain FastAPI app — the same thing
`@modal.fastapi_endpoint` does in the container — and exercised over HTTP
with `TestClient`, so the `Depends(...)` wiring, the 429 status and the
`Retry-After` header are what a real caller would see. Pipeline / yt-dlp /
storage are stubbed (no GPU, no network).

What this does NOT (and cannot, without a live Modal deploy) prove: that the
counters are shared between containers. They are not — the limiter is
in-memory, per container (see core/rate_limit.py and checklist-go-live.md).

Must NOT import `local_server` (collected by the lean CI job without torch).
"""

import types
import warnings
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import main
from core.rate_limit import SlidingWindowRateLimiter
from core.schemas import ProcessVideoResponse
from tests.manual_cuts_fixture import load_manual_cuts_payload
from tests.storage_fakes import FakeObjectStorage

SECRET = "test-secret"
AUTH = {"Authorization": f"Bearer {SECRET}"}
WRONG_AUTH = {"Authorization": "Bearer wrong-token"}
YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
ATTACKER = ("203.0.113.10", 40000)
OTHER_CLIENT = ("198.51.100.20", 40000)


def _raw(attribute):
    for name in ("_get_raw_f", "get_raw_f"):
        getter = getattr(attribute, name, None)
        if callable(getter):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                return getter()
    return attribute


def _raw_process_video():
    clipper_cls = main.AiPodcastClipper
    if hasattr(clipper_cls, "_get_user_cls"):
        clipper_cls = clipper_cls._get_user_cls()
    return _raw(clipper_cls.process_video)


@pytest.fixture
def app_and_stubs(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    pipeline = MagicMock(return_value=ProcessVideoResponse(file_id="x", clips=[]))
    monkeypatch.setattr(main, "run_video_processing_pipeline", pipeline)
    downloader = MagicMock(
        return_value={"s3_key": "youtube/x/original.mp4", "title": "t", "duration": 1, "thumbnail": None}
    )
    monkeypatch.setattr(main, "download_youtube_to_s3", downloader)
    monkeypatch.setattr(main, "create_object_storage", MagicMock(return_value=FakeObjectStorage()))
    # Small limits so the test exercises the boundary without 30 requests.
    monkeypatch.setattr(
        main, "PROCESS_VIDEO_RATE_LIMITER", SlidingWindowRateLimiter(limit=2, window_seconds=60)
    )
    monkeypatch.setattr(
        main, "DOWNLOAD_YOUTUBE_RATE_LIMITER", SlidingWindowRateLimiter(limit=3, window_seconds=60)
    )

    app = FastAPI()
    fake_clipper = MagicMock()
    app.post("/process_video")(types.MethodType(_raw_process_video(), fake_clipper))
    app.post("/download_youtube")(_raw(main.download_youtube))
    return app, pipeline, downloader


def _client(app, peer=ATTACKER):
    return TestClient(app, client=peer)


class TestProductionDefaults:
    def test_process_video_default_limit_is_10_per_minute(self):
        assert main.PROCESS_VIDEO_RATE_LIMITER.limit == 10
        assert main.PROCESS_VIDEO_RATE_LIMITER.window_seconds == 60

    def test_download_youtube_default_limit_is_30_per_minute(self):
        assert main.DOWNLOAD_YOUTUBE_RATE_LIMITER.limit == 30
        assert main.DOWNLOAD_YOUTUBE_RATE_LIMITER.window_seconds == 60


class TestMainProcessVideoRateLimit:
    def test_requests_under_the_limit_are_processed_normally(self, app_and_stubs):
        app, pipeline, _ = app_and_stubs
        client = _client(app)
        for _ in range(2):
            response = client.post("/process_video", json=load_manual_cuts_payload(), headers=AUTH)
            assert response.status_code == 200
        assert pipeline.call_count == 2

    def test_request_over_the_limit_gets_429_and_never_reaches_the_pipeline(self, app_and_stubs):
        app, pipeline, _ = app_and_stubs
        client = _client(app)
        for _ in range(2):
            client.post("/process_video", json=load_manual_cuts_payload(), headers=AUTH)
        response = client.post("/process_video", json=load_manual_cuts_payload(), headers=AUTH)
        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) >= 1
        assert pipeline.call_count == 2  # the throttled request cost no GPU work

    def test_other_ip_is_not_affected(self, app_and_stubs):
        app, pipeline, _ = app_and_stubs
        attacker = _client(app, ATTACKER)
        for _ in range(3):
            attacker.post("/process_video", json=load_manual_cuts_payload(), headers=AUTH)
        response = _client(app, OTHER_CLIENT).post(
            "/process_video", json=load_manual_cuts_payload(), headers=AUTH
        )
        assert response.status_code == 200

    def test_wrong_token_attempts_also_count_brute_force(self, app_and_stubs):
        """Throttling runs before the token check, so guessing the static
        Bearer token is throttled too (429 instead of yet another 401)."""
        app, pipeline, _ = app_and_stubs
        client = _client(app)
        codes = [
            client.post("/process_video", json=load_manual_cuts_payload(), headers=WRONG_AUTH).status_code
            for _ in range(3)
        ]
        assert codes == [401, 401, 429]
        pipeline.assert_not_called()


class TestMainDownloadYouTubeRateLimit:
    def test_requests_under_the_limit_are_processed_normally(self, app_and_stubs):
        app, _, downloader = app_and_stubs
        client = _client(app)
        for _ in range(3):
            response = client.post("/download_youtube", json={"url": YOUTUBE_URL}, headers=AUTH)
            assert response.status_code == 200
            assert response.json()["success"] is True
        assert downloader.call_count == 3

    def test_request_over_the_limit_gets_429_and_never_downloads(self, app_and_stubs):
        app, _, downloader = app_and_stubs
        client = _client(app)
        for _ in range(3):
            client.post("/download_youtube", json={"url": YOUTUBE_URL}, headers=AUTH)
        response = client.post("/download_youtube", json={"url": YOUTUBE_URL}, headers=AUTH)
        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) >= 1
        assert downloader.call_count == 3

    def test_limits_are_per_endpoint(self, app_and_stubs):
        """Exhausting /process_video must not block /download_youtube for the
        same IP (separate budgets — different cost profiles)."""
        app, _, _ = app_and_stubs
        client = _client(app)
        for _ in range(3):
            client.post("/process_video", json=load_manual_cuts_payload(), headers=AUTH)
        response = client.post("/download_youtube", json={"url": YOUTUBE_URL}, headers=AUTH)
        assert response.status_code == 200
