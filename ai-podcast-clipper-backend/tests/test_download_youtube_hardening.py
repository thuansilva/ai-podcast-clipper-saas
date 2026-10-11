"""RNF-SEC-06 / RNF-SEC-18 — hardening of the `download_youtube` contract.

- RNF-SEC-06 (SSRF): a URL whose host isn't youtube.com/youtu.be must be
  rejected with a 4xx before yt-dlp is ever invoked (the host check lives in
  `core/youtube_downloader.py::_assert_youtube_host`; the endpoint maps
  `YouTubeInvalidHostError` to 400 instead of letting it fall into the
  generic 500).
- RNF-SEC-18 (arbitrary object key): `DownloadYouTubeRequest.s3_key`, when
  sent, must match `youtube/<uuid>/original.mp4` — the only format the
  frontend generates (import-youtube-video.use-case.ts). Anything else
  (another user's `clips/...`, `../`, absolute paths, ...) is a 422, so a
  caller holding AUTH_TOKEN can't overwrite arbitrary objects in the bucket.
  Unknown fields (e.g. the legacy `s3_bucket`) are a 422 too (extra=forbid).

This file must NOT import `local_server` (it's collected by the lean
`backend` CI job, which has no torch). The local runner's half of these
checks lives in `tests/test_local_server.py`.
"""

import os
import uuid
import warnings
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from core.schemas import DownloadYouTubeRequest
from tests.storage_fakes import FakeObjectStorage

SECRET = "test-secret"
VALID_KEY = "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4"
VALID_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

INVALID_KEYS = [
    "clips/other-user/video.mp4",
    "youtube/../clips/other-user/video.mp4",
    "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/../../clips/x.mp4",
    "/etc/passwd",
    "/tmp/ai-podcast-clipper/abc.mp4",
    "uploads/u/x/podcast.mp4",
    "youtube/not-a-uuid/original.mp4",
    "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/other.mp4",
    "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4\n",
    "prefix/youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
    "",
]

SSRF_URLS = [
    "http://169.254.169.254/latest/meta-data/",
    "http://evil.com/video",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "http://localhost:9000/minio/bucket",
]


class TestDownloadYouTubeRequestS3KeyContract:
    def test_accepts_frontend_format(self):
        req = DownloadYouTubeRequest(url=VALID_URL, s3_key=VALID_KEY)
        assert req.s3_key == VALID_KEY

    def test_accepts_server_generated_format(self):
        key = f"youtube/{uuid.uuid4()}/original.mp4"
        assert DownloadYouTubeRequest(url=VALID_URL, s3_key=key).s3_key == key

    def test_s3_key_is_optional(self):
        assert DownloadYouTubeRequest(url=VALID_URL).s3_key is None

    @pytest.mark.parametrize("bad_key", INVALID_KEYS)
    def test_rejects_key_outside_youtube_uuid_format(self, bad_key):
        with pytest.raises(ValidationError):
            DownloadYouTubeRequest(url=VALID_URL, s3_key=bad_key)

    def test_rejects_unknown_field(self):
        with pytest.raises(ValidationError):
            DownloadYouTubeRequest(url=VALID_URL, s3_bucket="attacker-bucket")


def _raw_main_download_youtube():
    """The undecorated function (its real signature is what FastAPI needs to
    build the request model / Depends). Modal only exposes it via the
    deprecated `get_raw_f`; silence that here rather than reach into the
    private `_raw_f_`."""
    endpoint = main.download_youtube
    for name in ("_get_raw_f", "get_raw_f"):
        getter = getattr(endpoint, name, None)
        if callable(getter):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                return getter()
    if hasattr(endpoint, "local"):
        return endpoint.local
    return endpoint


@pytest.fixture
def main_http(monkeypatch):
    """Mounts main.download_youtube's raw function on a plain FastAPI app —
    the same thing `@modal.fastapi_endpoint` does — so request validation
    (422) is exercised at the HTTP layer, exactly as in production."""
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    storage = FakeObjectStorage()
    monkeypatch.setattr(main, "create_object_storage", MagicMock(return_value=storage))
    app = FastAPI()
    app.post("/download_youtube")(_raw_main_download_youtube())
    return TestClient(app), storage


class TestMainDownloadYouTubeHttp:
    @pytest.mark.parametrize("bad_key", INVALID_KEYS)
    def test_invalid_s3_key_returns_422_before_any_download(self, main_http, bad_key):
        client, storage = main_http
        with patch("main.download_youtube_to_s3") as download:
            response = client.post(
                "/download_youtube",
                json={"url": VALID_URL, "s3_key": bad_key},
                headers={"Authorization": f"Bearer {SECRET}"},
            )
        assert response.status_code == 422
        download.assert_not_called()
        assert storage.uploads == []

    def test_legacy_s3_bucket_field_returns_422(self, main_http):
        client, _ = main_http
        with patch("main.download_youtube_to_s3") as download:
            response = client.post(
                "/download_youtube",
                json={"url": VALID_URL, "s3_bucket": "x", "s3_key": VALID_KEY},
                headers={"Authorization": f"Bearer {SECRET}"},
            )
        assert response.status_code == 422
        download.assert_not_called()

    @pytest.mark.parametrize("ssrf_url", SSRF_URLS)
    def test_non_youtube_host_returns_400_without_invoking_yt_dlp(self, main_http, ssrf_url):
        client, storage = main_http
        with patch("yt_dlp.YoutubeDL") as ydl:
            response = client.post(
                "/download_youtube",
                json={"url": ssrf_url},
                headers={"Authorization": f"Bearer {SECRET}"},
            )
        assert response.status_code == 400
        ydl.assert_not_called()
        assert storage.uploads == []

    def test_valid_request_uploads_through_storage_with_given_key(self, main_http):
        client, storage = main_http
        with patch("main.download_youtube_to_s3") as download:
            download.return_value = {
                "s3_key": VALID_KEY,
                "title": "t",
                "duration": 10,
                "thumbnail": None,
            }
            response = client.post(
                "/download_youtube",
                json={"url": VALID_URL, "s3_key": VALID_KEY},
                headers={"Authorization": f"Bearer {SECRET}"},
            )
        assert response.status_code == 200
        assert response.json()["s3_key"] == VALID_KEY
        assert download.call_args.kwargs["s3_key"] == VALID_KEY
        assert download.call_args.kwargs["storage"] is storage


def test_main_maps_invalid_host_error_to_400_direct_call(monkeypatch):
    """Direct-call variant (no HTTP layer), mirroring the other endpoint tests
    in tests/test_youtube_downloader.py."""
    from core.youtube_downloader import YouTubeInvalidHostError

    monkeypatch.setattr(main, "create_object_storage", MagicMock(return_value=FakeObjectStorage()))
    with patch.dict(os.environ, {"AUTH_TOKEN": SECRET}), \
            patch("main.download_youtube_to_s3", side_effect=YouTubeInvalidHostError("bad host")):
        with pytest.raises(HTTPException) as exc_info:
            _raw_main_download_youtube()(
                request=DownloadYouTubeRequest(url="http://evil.com/x"),
                token=HTTPAuthorizationCredentials(scheme="Bearer", credentials=SECRET),
            )
    assert exc_info.value.status_code == 400
