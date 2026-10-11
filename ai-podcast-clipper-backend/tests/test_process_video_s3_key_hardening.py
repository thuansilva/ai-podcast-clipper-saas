"""RNF-SEC-19 — `ProcessVideoRequest.s3_key` restricted to the formats the
system actually generates; no arbitrary local file read.

`core/video_pipeline.py::resolve_input_video_path` used to copy `s3_key`
straight from the local filesystem whenever `os.path.exists(s3_key)` was
true, so a caller holding AUTH_TOKEN could send `s3_key="/etc/passwd"` (or
any path inside the container) to `/process_video` and have it pulled into
the pipeline. Two layers close it:

1. Contract (this file + tests/test_local_server.py): `s3_key` must be one of
   - `youtube/<uuid>/original.mp4` (import-youtube-video.use-case.ts), or
   - `uploads/<userId>/<uuid>/<name>` (generate-upload-url.use-case.ts:
     `uuidv4()`, name sanitized with `replace(/[^a-zA-Z0-9._-]/g, "_")`,
     Clerk user id), with `.`/`..` rejected as the name segment.
   Anything else -> 422 before any download/transcription.
2. Pipeline (tests/test_video_pipeline.py::TestResolveInputVideoPath): the
   input video always comes from the pluggable storage, never from disk.

This file must NOT import `local_server` (it's collected by the lean
`backend` CI job, which has no torch). The local runner's HTTP half lives in
`tests/test_local_server.py`.
"""

import types
import uuid
import warnings
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from core.schemas import ProcessVideoRequest, ProcessVideoResponse
from tests.storage_fakes import FakeObjectStorage

SECRET = "test-secret"
FIXED_UUID = "3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b"

VALID_KEYS = [
    f"youtube/{FIXED_UUID}/original.mp4",
    f"uploads/user_2abcDEF123/{FIXED_UUID}/podcast.mp4",
    f"uploads/user_2abc-DEF_123/{FIXED_UUID}/Meu_Podcast_Ep.1-final.mp4",
    f"uploads/user_2abc/{FIXED_UUID.upper()}/a.mp4",
    f"uploads/user_2abc/{FIXED_UUID}/.hidden.mp4",
]

INVALID_KEYS = [
    "",
    "/etc/passwd",
    "/tmp/ai-podcast-clipper/abc.mp4",
    "../etc/passwd",
    "../x",
    f"uploads/user_2abc/{FIXED_UUID}/..",
    f"uploads/user_2abc/{FIXED_UUID}/.",
    f"uploads/user_2abc/{FIXED_UUID}/../../../etc/passwd",
    f"uploads/../{FIXED_UUID}/podcast.mp4",
    f"uploads/user_2abc/not-a-uuid/podcast.mp4",
    f"uploads/user_2abc/{FIXED_UUID}/",
    f"uploads/user_2abc/{FIXED_UUID}/sub/podcast.mp4",
    f"uploads/user 2abc/{FIXED_UUID}/podcast.mp4",
    f"uploads/user_2abc/{FIXED_UUID}/podcast.mp4\n",
    f"uploads//{FIXED_UUID}/podcast.mp4",
    "clips/user_2abc/abc/clip_0.mp4",
    "youtube/not-a-uuid/original.mp4",
    f"youtube/{FIXED_UUID}/other.mp4",
    f"youtube/{FIXED_UUID}/original.mp4\n",
    f"/youtube/{FIXED_UUID}/original.mp4",
    f"prefix/youtube/{FIXED_UUID}/original.mp4",
    "podcasts/episode_1.mp4",
]


class TestProcessVideoRequestS3KeyContract:
    @pytest.mark.parametrize("key", VALID_KEYS)
    def test_accepts_system_generated_formats(self, key):
        assert ProcessVideoRequest(s3_key=key).s3_key == key

    def test_accepts_server_generated_youtube_key(self):
        key = f"youtube/{uuid.uuid4()}/original.mp4"
        assert ProcessVideoRequest(s3_key=key).s3_key == key

    @pytest.mark.parametrize("bad_key", INVALID_KEYS)
    def test_rejects_any_other_format(self, bad_key):
        with pytest.raises(ValidationError):
            ProcessVideoRequest(s3_key=bad_key)


def _raw_main_process_video():
    """The undecorated `AiPodcastClipper.process_video` (Modal only exposes it
    via the deprecated `_get_raw_f`/`get_raw_f`)."""
    clipper_cls = main.AiPodcastClipper
    if hasattr(clipper_cls, "_get_user_cls"):
        clipper_cls = clipper_cls._get_user_cls()
    attribute = clipper_cls.process_video
    for name in ("_get_raw_f", "get_raw_f"):
        getter = getattr(attribute, name, None)
        if callable(getter):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                return getter()
    return attribute


@pytest.fixture
def main_http(monkeypatch: pytest.MonkeyPatch):
    """Mounts main.process_video (bound to a fake container instance) on a
    plain FastAPI app — the same thing `@modal.fastapi_endpoint` does — so
    request validation (422) is exercised at the HTTP layer."""
    monkeypatch.setenv("AUTH_TOKEN", SECRET)
    storage = FakeObjectStorage()
    fake_clipper = MagicMock()
    fake_clipper.storage = storage
    pipeline = MagicMock(return_value=ProcessVideoResponse(file_id="x", clips=[]))
    monkeypatch.setattr(main, "run_video_processing_pipeline", pipeline)
    app = FastAPI()
    app.post("/process_video")(types.MethodType(_raw_main_process_video(), fake_clipper))
    return TestClient(app), storage, pipeline, fake_clipper


class TestMainProcessVideoHttp:
    @pytest.mark.parametrize("bad_key", ["/etc/passwd", "../x", f"uploads/u/{FIXED_UUID}/.."])
    def test_local_path_s3_key_returns_422_before_any_download(self, main_http, bad_key):
        client, storage, pipeline, fake_clipper = main_http

        response = client.post(
            "/process_video",
            json={"s3_key": bad_key},
            headers={"Authorization": f"Bearer {SECRET}"},
        )

        assert response.status_code == 422
        pipeline.assert_not_called()
        fake_clipper.transcriber.transcribe.assert_not_called()
        assert storage.downloads == []

    @pytest.mark.parametrize("key", VALID_KEYS[:2])
    def test_valid_s3_key_reaches_the_pipeline(self, main_http, key):
        client, _, pipeline, _ = main_http

        response = client.post(
            "/process_video",
            json={"s3_key": key},
            headers={"Authorization": f"Bearer {SECRET}"},
        )

        assert response.status_code == 200
        assert pipeline.call_args.kwargs["request"].s3_key == key
