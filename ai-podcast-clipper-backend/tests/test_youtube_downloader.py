"""Tests for YouTube downloader core module and Modal CPU worker endpoint.

Phase 1b (D2/D3): `download_youtube_to_s3` receives an injected `ObjectStorage`
(tests/storage_fakes.py) instead of `s3_client`, and no longer takes a bucket:
the bucket is the central config's (core/storage/factory.py). The endpoint
builds its storage through `main.create_object_storage` and ignores any bucket
sent by the client. Tests that exercise the new wiring are RED until Fase 2.
"""

import inspect
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from yt_dlp.utils import DownloadError, download_range_func

import main
from core.schemas import DownloadYouTubeRequest, DownloadYouTubeResponse
from core.youtube_downloader import (
    VIDEO_RANGE_MARGIN_SECONDS,
    YouTubeAgeRestrictedError,
    YouTubeDownloaderError,
    YouTubeInvalidHostError,
    YouTubeVideoUnavailableError,
    download_youtube_to_s3,
    get_youtube_video_info,
    remap_manual_cuts,
)
from main import download_youtube
from tests.storage_fakes import FakeObjectStorage


@pytest.fixture
def sample_video_info():
    return {
        "id": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "duration": 212,
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        "age_limit": 0,
    }


class TestGetYouTubeVideoInfo:
    @patch("yt_dlp.YoutubeDL")
    def test_get_info_success(self, mock_ydl_cls, sample_video_info):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = sample_video_info
        mock_ydl_cls.return_value = mock_ydl

        info = get_youtube_video_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert info["id"] == "dQw4w9WgXcQ"
        assert info["title"] == "Never Gonna Give You Up"
        assert info["duration"] == 212
        assert info["thumbnail"] == "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"

        mock_ydl.extract_info.assert_called_once_with(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ", download=False
        )

    def test_get_info_empty_or_invalid_url_raises_error(self):
        with pytest.raises(YouTubeVideoUnavailableError):
            get_youtube_video_info("")

        with pytest.raises(YouTubeVideoUnavailableError):
            get_youtube_video_info("   ")

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_unavailable_video(self, mock_ydl_cls):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = DownloadError(
            "Video unavailable. This video is not available"
        )
        mock_ydl_cls.return_value = mock_ydl

        with pytest.raises(YouTubeVideoUnavailableError) as exc_info:
            get_youtube_video_info("https://www.youtube.com/watch?v=invalid_id")

        assert "unavailable" in str(exc_info.value).lower()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_private_video(self, mock_ydl_cls):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = DownloadError(
            "Private video. Sign in if you've been granted access"
        )
        mock_ydl_cls.return_value = mock_ydl

        with pytest.raises(YouTubeVideoUnavailableError) as exc_info:
            get_youtube_video_info("https://www.youtube.com/watch?v=private_id")

        assert "private" in str(exc_info.value).lower()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_age_restricted_by_exception(self, mock_ydl_cls):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = DownloadError(
            "Sign in to confirm your age. This video may be inappropriate for some users."
        )
        mock_ydl_cls.return_value = mock_ydl

        with pytest.raises(YouTubeAgeRestrictedError) as exc_info:
            get_youtube_video_info("https://www.youtube.com/watch?v=age_restricted_id")

        assert "age-restricted" in str(exc_info.value).lower()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_age_restricted_by_metadata(self, mock_ydl_cls, sample_video_info):
        sample_video_info["age_limit"] = 18
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = sample_video_info
        mock_ydl_cls.return_value = mock_ydl

        with pytest.raises(YouTubeAgeRestrictedError) as exc_info:
            get_youtube_video_info("https://www.youtube.com/watch?v=age_id")

        assert "age-restricted" in str(exc_info.value).lower()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_none_result_raises_error(self, mock_ydl_cls):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = None
        mock_ydl_cls.return_value = mock_ydl

        with pytest.raises(YouTubeVideoUnavailableError):
            get_youtube_video_info("https://www.youtube.com/watch?v=none_id")

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_fallback_empty_fields(self, mock_ydl_cls):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = {
            "id": "abc12345678",
            # missing title, duration, thumbnail
        }
        mock_ydl_cls.return_value = mock_ydl

        info = get_youtube_video_info("https://www.youtube.com/watch?v=abc12345678")
        assert info["id"] == "abc12345678"
        assert info["title"] == ""
        assert info["duration"] == 0
        assert info["thumbnail"] == ""


class TestDownloadYouTubeToS3:
    @patch("yt_dlp.YoutubeDL")
    def test_download_success_uploads_through_injected_storage(
        self, mock_ydl_cls, sample_video_info
    ):
        recorded_temp_dir = []

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            recorded_temp_dir.append(parent_dir)
            file_path = os.path.join(parent_dir, "dQw4w9WgXcQ.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock video bytes")
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl.prepare_filename.return_value = "/some/path/dQw4w9WgXcQ.mp4"
        mock_ydl_cls.return_value = mock_ydl

        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_key="uploads/podcast.mp4",
            storage=storage,
        )

        assert result["s3_key"] == "uploads/podcast.mp4"
        assert result["title"] == "Never Gonna Give You Up"
        assert result["duration"] == 212
        assert result["thumbnail"] == "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"

        assert len(storage.uploads) == 1
        uploaded_file, key = storage.uploads[0]
        assert uploaded_file.endswith("dQw4w9WgXcQ.mp4")
        assert key == "uploads/podcast.mp4"

        # Verify temp directory cleanup
        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])

    @patch("yt_dlp.YoutubeDL")
    def test_download_cleans_up_temp_dir_on_download_failure(self, mock_ydl_cls):
        recorded_temp_dir = []

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            recorded_temp_dir.append(parent_dir)
            raise DownloadError("Connection refused by YouTube")

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl_cls.return_value = mock_ydl

        storage = FakeObjectStorage()

        with pytest.raises(YouTubeDownloaderError):
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=fail",
                s3_key="key.mp4",
                storage=storage,
            )

        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])
        assert storage.uploads == []

    @patch("yt_dlp.YoutubeDL")
    def test_download_cleans_up_temp_dir_on_storage_upload_failure(
        self, mock_ydl_cls, sample_video_info
    ):
        recorded_temp_dir = []

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            recorded_temp_dir.append(parent_dir)
            file_path = os.path.join(parent_dir, "dQw4w9WgXcQ.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock video bytes")
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl_cls.return_value = mock_ydl

        storage = FakeObjectStorage(upload_error=RuntimeError("S3 connection timed out"))

        with pytest.raises(YouTubeDownloaderError) as exc_info:
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                s3_key="key.mp4",
                storage=storage,
            )

        assert "s3" in str(exc_info.value).lower()
        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])

    @patch("yt_dlp.YoutubeDL")
    def test_download_raises_when_no_file_produced(
        self, mock_ydl_cls, sample_video_info
    ):
        recorded_temp_dir = []

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            recorded_temp_dir.append(os.path.dirname(outtmpl))
            # Does not write any file
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl.prepare_filename.return_value = "/non/existent/path.mp4"
        mock_ydl_cls.return_value = mock_ydl

        storage = FakeObjectStorage()

        with pytest.raises(YouTubeDownloaderError) as exc_info:
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                s3_key="key.mp4",
                storage=storage,
            )

        assert "found" in str(exc_info.value).lower()
        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])
        assert storage.uploads == []

    @patch("boto3.client")
    @patch("yt_dlp.YoutubeDL")
    def test_download_never_creates_its_own_boto3_client(
        self, mock_ydl_cls, mock_boto3_client, sample_video_info
    ):
        # D2: the storage is the only source of truth for the S3 config (endpoint,
        # path-style). A hidden boto3.client("s3") would ignore S3_ENDPOINT_URL.
        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            file_path = os.path.join(parent_dir, "dQw4w9WgXcQ.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock video bytes")
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl_cls.return_value = mock_ydl

        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_key="default-key.mp4",
            storage=storage,
        )

        mock_boto3_client.assert_not_called()
        assert len(storage.uploads) == 1
        assert result["s3_key"] == "default-key.mp4"

    def test_bucket_is_not_a_parameter_of_download_youtube_to_s3(self):
        # D3: the destination bucket comes only from the central config, never from
        # the caller. The storage parameter replaces s3_client.
        parameters = inspect.signature(download_youtube_to_s3).parameters
        assert "s3_bucket" not in parameters
        assert "s3_client" not in parameters
        assert "storage" in parameters

    @patch("yt_dlp.YoutubeDL")
    def test_yt_dlp_format_configuration(self, mock_ydl_cls, sample_video_info):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            file_path = os.path.join(parent_dir, "video.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock")
            return sample_video_info

        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl_cls.return_value = mock_ydl
        storage = FakeObjectStorage()

        download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_key="k.mp4",
            storage=storage,
        )

        call_opts = mock_ydl_cls.call_args[0][0]
        # `[protocol^=https]` excludes HLS (m3u8_native) formats — see
        # `TestDownloadYouTubeToS3WithTimeRanges.test_range_format_spec_excludes_hls_protocol`
        # for the bug this guards against (applied here too, for
        # consistency/defense in depth, even though the whole-video path
        # hasn't been observed to hit it).
        expected_format = (
            "bestvideo[height<=1080][ext=mp4][protocol^=https]+bestaudio[ext=m4a][protocol^=https]/"
            "best[height<=1080][ext=mp4][protocol^=https]/best"
        )
        assert call_opts["format"] == expected_format
        assert call_opts["merge_output_format"] == "mp4"


class TestHostValidation:
    """SSRF defense-in-depth: reject any URL whose host isn't youtube.com/youtu.be
    before yt-dlp ever touches it (yt-dlp's generic extractor will happily fetch
    arbitrary hosts, including internal/metadata endpoints)."""

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_rejects_non_youtube_host(self, mock_ydl_cls):
        with pytest.raises(YouTubeInvalidHostError):
            get_youtube_video_info("https://evil.example.com/watch?v=dQw4w9WgXcQ")
        mock_ydl_cls.assert_not_called()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_rejects_internal_metadata_host(self, mock_ydl_cls):
        with pytest.raises(YouTubeInvalidHostError):
            get_youtube_video_info("http://169.254.169.254/latest/meta-data/")
        mock_ydl_cls.assert_not_called()

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_rejects_lookalike_host(self, mock_ydl_cls):
        with pytest.raises(YouTubeInvalidHostError):
            get_youtube_video_info("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")
        mock_ydl_cls.assert_not_called()

    @patch("yt_dlp.YoutubeDL")
    def test_download_rejects_non_youtube_host(self, mock_ydl_cls):
        storage = FakeObjectStorage()
        with pytest.raises(YouTubeInvalidHostError):
            download_youtube_to_s3(
                url="https://attacker.example.com/video",
                s3_key="key.mp4",
                storage=storage,
            )
        mock_ydl_cls.assert_not_called()
        assert storage.uploads == []

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_accepts_youtu_be_short_link(self, mock_ydl_cls, sample_video_info):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = sample_video_info
        mock_ydl_cls.return_value = mock_ydl

        info = get_youtube_video_info("https://youtu.be/dQw4w9WgXcQ")
        assert info["id"] == "dQw4w9WgXcQ"

    @patch("yt_dlp.YoutubeDL")
    def test_get_info_accepts_www_subdomain(self, mock_ydl_cls, sample_video_info):
        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = sample_video_info
        mock_ydl_cls.return_value = mock_ydl

        info = get_youtube_video_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert info["id"] == "dQw4w9WgXcQ"


class TestDownloadYouTubeRequestSchema:
    def test_request_schema_has_no_client_supplied_bucket(self):
        # D3: the bucket is no longer a request field (and, since RNF-SEC-18,
        # sending it is a 422 — extra="forbid").
        assert "s3_bucket" not in DownloadYouTubeRequest.model_fields


class TestDownloadYouTubeEndpoint:
    @pytest.fixture
    def endpoint_storage(self, monkeypatch: pytest.MonkeyPatch) -> FakeObjectStorage:
        """The endpoint builds its storage from the central config
        (main.create_object_storage). Replaced here by an in-memory fake."""
        storage = FakeObjectStorage()
        monkeypatch.setattr(main, "create_object_storage", MagicMock(return_value=storage))
        return storage

    def _get_raw_endpoint(self):
        if hasattr(download_youtube, "local"):
            return download_youtube.local
        if hasattr(download_youtube, "get_raw_f"):
            return download_youtube.get_raw_f()
        return download_youtube

    @patch("main.download_youtube_to_s3")
    def test_endpoint_success(self, mock_download, endpoint_storage: FakeObjectStorage):
        mock_download.return_value = {
            "s3_key": "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            "title": "Exciting Podcast",
            "duration": 360,
            "thumbnail": "https://img.youtube.com/vi/vid123/hqdefault.jpg",
        }

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "valid_secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "valid_secret"}):
            req = DownloadYouTubeRequest(
                url="https://www.youtube.com/watch?v=vid123",
                s3_key="youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            )
            resp = endpoint_fn(request=req, token=token)

            assert isinstance(resp, DownloadYouTubeResponse)
            assert resp.success is True
            assert resp.s3_key == "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4"
            assert resp.title == "Exciting Podcast"
            assert resp.duration == 360
            assert resp.thumbnail == "https://img.youtube.com/vi/vid123/hqdefault.jpg"

            assert mock_download.call_args.kwargs["storage"] is endpoint_storage

    def test_endpoint_rejects_bucket_sent_by_client(self):
        # D3 + RNF-SEC-18: a client-supplied bucket used to be silently
        # ignored; with extra="forbid" it is now rejected at the contract
        # (422 at the HTTP layer, see tests/test_download_youtube_hardening.py)
        # and therefore can never reach the download use case.
        with pytest.raises(ValidationError):
            DownloadYouTubeRequest(
                url="https://www.youtube.com/watch?v=vid123",
                s3_bucket="attacker-controlled-bucket",
                s3_key="youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            )

    @patch("main.download_youtube_to_s3")
    def test_endpoint_generates_s3_key_if_omitted(
        self, mock_download, endpoint_storage: FakeObjectStorage
    ):
        mock_download.return_value = {
            "s3_key": "auto-generated-key",
            "title": "Auto Key Podcast",
            "duration": 180,
            "thumbnail": None,
        }

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "secret"}):
            req = DownloadYouTubeRequest(url="https://www.youtube.com/watch?v=xyz")
            resp = endpoint_fn(request=req, token=token)

            assert resp.success is True
            mock_download.assert_called_once()
            called_args = mock_download.call_args[1]
            assert called_args["url"] == "https://www.youtube.com/watch?v=xyz"
            assert called_args["s3_key"].startswith("youtube/")
            assert called_args["s3_key"].endswith("/original.mp4")

    def test_endpoint_unauthorized_token(self):
        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "wrong_secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "correct_secret"}):
            req = DownloadYouTubeRequest(url="https://www.youtube.com/watch?v=xyz")
            with pytest.raises(HTTPException) as exc_info:
                endpoint_fn(request=req, token=token)

            assert exc_info.value.status_code == 401

    @patch("main.download_youtube_to_s3")
    def test_endpoint_handles_unavailable_video_404(self, mock_download):
        mock_download.side_effect = YouTubeVideoUnavailableError("Video is unavailable")

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "secret"}):
            req = DownloadYouTubeRequest(url="https://www.youtube.com/watch?v=missing")
            with pytest.raises(HTTPException) as exc_info:
                endpoint_fn(request=req, token=token)

            assert exc_info.value.status_code == 404

    @patch("main.download_youtube_to_s3")
    def test_endpoint_handles_age_restricted_video_403(self, mock_download):
        mock_download.side_effect = YouTubeAgeRestrictedError("Video is age restricted")

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "secret"}):
            req = DownloadYouTubeRequest(url="https://www.youtube.com/watch?v=adult")
            with pytest.raises(HTTPException) as exc_info:
                endpoint_fn(request=req, token=token)

            assert exc_info.value.status_code == 403

    @patch("main.download_youtube_to_s3")
    def test_endpoint_passes_manual_cuts_as_time_ranges_and_returns_remapping(
        self, mock_download, endpoint_storage: FakeObjectStorage
    ):
        mock_download.return_value = {
            "s3_key": "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            "title": "Exciting Podcast",
            "duration": 3600,
            "thumbnail": "https://img.youtube.com/vi/vid123/hqdefault.jpg",
            "remapped_ranges": [
                {"original_start": 8.0, "original_end": 17.0, "offset_in_output": 0.0},
            ],
        }

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "valid_secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "valid_secret"}):
            req = DownloadYouTubeRequest(
                url="https://www.youtube.com/watch?v=vid123",
                s3_key="youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
                manual_cuts=[{"start": 10.0, "end": 15.0, "title": "Clip 1"}],
            )
            resp = endpoint_fn(request=req, token=token)

        assert isinstance(resp, DownloadYouTubeResponse)
        assert mock_download.call_args.kwargs["time_ranges"] == [(10.0, 15.0)]
        assert resp.remapped_ranges is not None
        assert resp.remapped_ranges[0].original_start == 8.0
        assert resp.remapped_ranges[0].offset_in_output == 0.0
        assert resp.remapped_cuts is not None
        assert len(resp.remapped_cuts) == 1
        remapped_cut = resp.remapped_cuts[0]
        assert remapped_cut.original_start == 10.0
        assert remapped_cut.original_end == 15.0
        assert remapped_cut.new_start == 2.0
        assert remapped_cut.new_end == 7.0
        assert remapped_cut.title == "Clip 1"

    @patch("main.download_youtube_to_s3")
    def test_endpoint_without_manual_cuts_passes_no_time_ranges_and_no_remapping(
        self, mock_download, endpoint_storage: FakeObjectStorage
    ):
        mock_download.return_value = {
            "s3_key": "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            "title": "Exciting Podcast",
            "duration": 360,
            "thumbnail": None,
        }

        endpoint_fn = self._get_raw_endpoint()
        token = MagicMock()
        token.credentials = "valid_secret"

        with patch.dict(os.environ, {"AUTH_TOKEN": "valid_secret"}):
            req = DownloadYouTubeRequest(
                url="https://www.youtube.com/watch?v=vid123",
                s3_key="youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4",
            )
            resp = endpoint_fn(request=req, token=token)

        assert mock_download.call_args.kwargs["time_ranges"] is None
        assert resp.remapped_ranges is None
        assert resp.remapped_cuts is None


class TestRemapManualCuts:
    """Unit tests for `remap_manual_cuts`, the thin wrapper around
    `core.time_ranges.remap_cuts_to_output` shared by `main.py` and
    `local_server.py`."""

    def test_single_cut_inside_single_range(self):
        cut = ManualCutLike(start=10.0, end=15.0, title="Clip 1")
        remapped_ranges = [
            {"original_start": 8.0, "original_end": 17.0, "offset_in_output": 0.0}
        ]

        result = remap_manual_cuts([cut], remapped_ranges)

        assert result == [
            {
                "original_start": 10.0,
                "original_end": 15.0,
                "new_start": 2.0,
                "new_end": 7.0,
                "title": "Clip 1",
            }
        ]

    def test_cuts_across_different_merged_ranges(self):
        cuts = [
            ManualCutLike(start=102.0, end=108.0, title="Second"),
            ManualCutLike(start=1.0, end=4.0, title="First"),
        ]
        remapped_ranges = [
            {"original_start": 0.0, "original_end": 10.0, "offset_in_output": 0.0},
            {"original_start": 100.0, "original_end": 110.0, "offset_in_output": 10.0},
        ]

        result = remap_manual_cuts(cuts, remapped_ranges)

        assert result[0]["new_start"] == 12.0
        assert result[0]["new_end"] == 18.0
        assert result[0]["title"] == "Second"
        assert result[1]["new_start"] == 1.0
        assert result[1]["new_end"] == 4.0
        assert result[1]["title"] == "First"

    def test_cut_missing_title_attribute_defaults_to_none(self):
        class BareCut:
            def __init__(self, start, end):
                self.start = start
                self.end = end

        remapped_ranges = [
            {"original_start": 0.0, "original_end": 10.0, "offset_in_output": 0.0}
        ]

        result = remap_manual_cuts([BareCut(1.0, 4.0)], remapped_ranges)

        assert result[0]["title"] is None


class ManualCutLike:
    """Minimal stand-in for `core.schemas.ManualCut` — `remap_manual_cuts` is
    duck-typed on purpose, so a plain object with `.start`/`.end`/`.title` is
    enough to test it without pulling in Pydantic validation."""

    def __init__(self, start: float, end: float, title=None):
        self.start = start
        self.end = end
        self.title = title


class TestDownloadYouTubeToS3WithTimeRanges:
    """`download_youtube_to_s3(..., time_ranges=...)` — manual-mode partial
    download (RF-PIPE-08): only the ranges covering `time_ranges` (merged
    with `VIDEO_RANGE_MARGIN_SECONDS`) are downloaded, then concatenated
    into a single output file uploaded to `s3_key`."""

    def _mock_ydl_for_ranges(self, mock_ydl_cls, *, full_duration=1000, age_limit=0):
        """Builds a `yt_dlp.YoutubeDL` mock that answers both the metadata
        preview call (`skip_download: True`) and the real download call
        (`download_ranges` set), emulating the real shape of
        `requested_downloads` observed by running yt-dlp for real (see this
        task's manual verification)."""
        created_segment_paths = []

        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            if opts.get("skip_download"):
                return {
                    "id": "vid123",
                    "title": "Full Video",
                    "duration": full_duration,
                    "thumbnail": "https://thumb.example/vid123.jpg",
                    "age_limit": age_limit,
                }

            outtmpl = opts["outtmpl"]
            parent_dir = os.path.dirname(outtmpl)
            ranges = list(opts["download_ranges"]({}, None))
            requested_downloads = []
            for r in ranges:
                start, end = r["start_time"], r["end_time"]
                filepath = os.path.join(parent_dir, f"vid123_{start}_{end}.mp4")
                with open(filepath, "wb") as f:
                    f.write(b"segment bytes")
                created_segment_paths.append(filepath)
                requested_downloads.append(
                    {"filepath": filepath, "section_start": start, "section_end": end}
                )
            return {
                "id": "vid123",
                "title": "Full Video",
                "duration": full_duration,
                "thumbnail": "https://thumb.example/vid123.jpg",
                "age_limit": age_limit,
                "requested_downloads": requested_downloads,
            }

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl_cls.return_value = mock_ydl
        return created_segment_paths

    def _fake_ffmpeg_concat_success(self, cmd, **kwargs):
        output_path = cmd[-1]
        with open(output_path, "wb") as f:
            f.write(b"concatenated bytes")
        result = MagicMock()
        result.returncode = 0
        result.stderr = b""
        return result

    @patch("core.youtube_downloader.has_video_stream", return_value=True)
    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_downloads_merged_ranges_and_uploads_single_concatenated_file(
        self, mock_ydl_cls, mock_subprocess_run, mock_has_video_stream
    ):
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000)
        concat_calls = []

        def fake_run(cmd, **kwargs):
            concat_calls.append(cmd)
            return self._fake_ffmpeg_concat_success(cmd, **kwargs)

        mock_subprocess_run.side_effect = fake_run
        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=vid123",
            s3_key="youtube/key/original.mp4",
            storage=storage,
            # These two cuts are 1s apart and will merge once expanded by
            # VIDEO_RANGE_MARGIN_SECONDS=2.0; the third is far away.
            time_ranges=[(40.0, 45.0), (46.0, 50.0), (500.0, 505.0)],
        )

        # download_ranges was built from the *merged* ranges, not the raw cuts.
        download_ranges_fn = mock_ydl_cls.call_args_list[-1][0][0]["download_ranges"]
        actual_ranges = [
            (r["start_time"], r["end_time"]) for r in download_ranges_fn({}, None)
        ]
        assert actual_ranges == [(38.0, 52.0), (498.0, 507.0)]

        # force_keyframes_at_cuts must be set so cuts land on keyframes.
        assert mock_ydl_cls.call_args_list[-1][0][0]["force_keyframes_at_cuts"] is True

        # Exactly one upload, of the concatenated file, never per-segment.
        assert len(storage.uploads) == 1
        uploaded_path, uploaded_key = storage.uploads[0]
        assert uploaded_key == "youtube/key/original.mp4"
        assert uploaded_path.endswith("concatenated_output.mp4")

        # The concat command received the segments in order.
        assert len(concat_calls) == 1
        assert concat_calls[0][:2] == ["ffmpeg", "-y"]
        assert "-c" in concat_calls[0] and "copy" in concat_calls[0]

        # `duration` is the *original* full video's duration, not the
        # (smaller) concatenated file's.
        assert result["duration"] == 1000
        assert result["title"] == "Full Video"
        assert result["s3_key"] == "youtube/key/original.mp4"

        assert result["remapped_ranges"] == [
            {"original_start": 38.0, "original_end": 52.0, "offset_in_output": 0.0},
            {"original_start": 498.0, "original_end": 507.0, "offset_in_output": 14.0},
        ]

    @patch("core.youtube_downloader.has_video_stream", return_value=True)
    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_margin_is_clamped_to_video_duration_at_the_edges(
        self, mock_ydl_cls, mock_subprocess_run, mock_has_video_stream
    ):
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=10.0)
        mock_subprocess_run.side_effect = self._fake_ffmpeg_concat_success
        storage = FakeObjectStorage()

        download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=vid123",
            s3_key="k.mp4",
            storage=storage,
            # margin=2.0 would push (0.5-2, 1.0+2)=(-1.5, 3.0) and
            # (9.0-2, 9.5+2)=(7.0, 11.5) outside [0, 10] without clamping.
            time_ranges=[(0.5, 1.0), (9.0, 9.5)],
        )

        download_ranges_fn = mock_ydl_cls.call_args_list[-1][0][0]["download_ranges"]
        actual_ranges = [
            (r["start_time"], r["end_time"]) for r in download_ranges_fn({}, None)
        ]
        assert actual_ranges == [(0.0, 3.0), (7.0, 10.0)]

    @patch("core.youtube_downloader.has_video_stream", return_value=True)
    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_stream_copy_concat_failure_falls_back_to_reencode(
        self, mock_ydl_cls, mock_subprocess_run, mock_has_video_stream
    ):
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000)

        calls = []

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            if "-c" in cmd:  # the stream-copy attempt
                result = MagicMock()
                result.returncode = 1
                result.stderr = b"stream copy failed: incompatible codecs"
                return result
            return self._fake_ffmpeg_concat_success(cmd, **kwargs)

        mock_subprocess_run.side_effect = fake_run
        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=vid123",
            s3_key="k.mp4",
            storage=storage,
            time_ranges=[(10.0, 15.0)],
        )

        assert len(calls) == 2
        assert "-c" in calls[0]
        assert "-c" not in calls[1]
        assert len(storage.uploads) == 1
        assert result["s3_key"] == "k.mp4"

    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_both_concat_attempts_failing_raises_downloader_error(
        self, mock_ydl_cls, mock_subprocess_run
    ):
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000)

        def fake_run(cmd, **kwargs):
            result = MagicMock()
            result.returncode = 1
            result.stderr = b"ffmpeg exploded"
            return result

        mock_subprocess_run.side_effect = fake_run
        storage = FakeObjectStorage()

        with pytest.raises(YouTubeDownloaderError):
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=vid123",
                s3_key="k.mp4",
                storage=storage,
                time_ranges=[(10.0, 15.0)],
            )

        assert storage.uploads == []

    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_age_restricted_video_raises_before_any_concat_or_upload(
        self, mock_ydl_cls, mock_subprocess_run
    ):
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000, age_limit=18)
        storage = FakeObjectStorage()

        with pytest.raises(YouTubeAgeRestrictedError):
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=vid123",
                s3_key="k.mp4",
                storage=storage,
                time_ranges=[(10.0, 15.0)],
            )

        mock_subprocess_run.assert_not_called()
        assert storage.uploads == []

    @patch("core.youtube_downloader.has_video_stream", return_value=True)
    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_range_format_spec_excludes_hls_protocol(
        self, mock_ydl_cls, mock_subprocess_run, mock_has_video_stream
    ):
        """Regression guard for the root-cause bug (see this task's report):
        without `[protocol^=https]`, yt-dlp can pick an HLS (`m3u8_native`)
        video format as "best", which combined with `download_ranges` +
        `force_keyframes_at_cuts=True` silently produced an audio-only
        output file. Asserting on `ydl_opts["format"]` is what lets this
        regression be caught without a real network call."""
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000)
        mock_subprocess_run.side_effect = self._fake_ffmpeg_concat_success
        storage = FakeObjectStorage()

        download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=vid123",
            s3_key="k.mp4",
            storage=storage,
            time_ranges=[(10.0, 15.0)],
        )

        # The real download call (not the metadata-only preview call).
        download_call_opts = [
            call.args[0]
            for call in mock_ydl_cls.call_args_list
            if "download_ranges" in call.args[0]
        ]
        assert len(download_call_opts) == 1
        format_spec = download_call_opts[0]["format"]
        assert "[protocol^=https]" in format_spec
        assert "m3u8" not in format_spec

    @patch("core.youtube_downloader.subprocess.run")
    @patch("yt_dlp.YoutubeDL")
    def test_raises_explicit_error_when_downloaded_file_has_no_video_stream(
        self, mock_ydl_cls, mock_subprocess_run
    ):
        """If the concatenated output has no video stream (e.g. an HLS
        format was picked despite the protocol restriction, or any other
        way the video track goes missing), raise a clear
        `YouTubeDownloaderError` *before* uploading — instead of letting a
        broken, audio-only file silently reach the rest of the pipeline
        (where it used to surface much later as a generic "Tracks or
        scores not found" error from LR-ASD)."""
        self._mock_ydl_for_ranges(mock_ydl_cls, full_duration=1000)
        mock_subprocess_run.side_effect = self._fake_ffmpeg_concat_success
        storage = FakeObjectStorage()

        with patch(
            "core.youtube_downloader.has_video_stream", return_value=False
        ) as mock_has_video_stream:
            with pytest.raises(YouTubeDownloaderError) as exc_info:
                download_youtube_to_s3(
                    url="https://www.youtube.com/watch?v=vid123",
                    s3_key="k.mp4",
                    storage=storage,
                    time_ranges=[(10.0, 15.0)],
                )

        assert "no video" in str(exc_info.value).lower()
        mock_has_video_stream.assert_called_once()
        assert storage.uploads == []

    @patch("yt_dlp.YoutubeDL")
    def test_empty_time_ranges_list_behaves_like_whole_video_download(
        self, mock_ydl_cls, sample_video_info
    ):
        # `time_ranges=[]` must be treated exactly like `None` (falsy check),
        # never as "download nothing".
        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            assert "download_ranges" not in opts
            parent_dir = os.path.dirname(opts["outtmpl"])
            file_path = os.path.join(parent_dir, "dQw4w9WgXcQ.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock video bytes")
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl.prepare_filename.return_value = "/some/path/dQw4w9WgXcQ.mp4"
        mock_ydl_cls.return_value = mock_ydl
        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_key="k.mp4",
            storage=storage,
            time_ranges=[],
        )

        assert "remapped_ranges" not in result
        assert len(storage.uploads) == 1


class TestDownloadYouTubeToS3WithoutTimeRangesRegression:
    """Regression guard: when `time_ranges` is `None` (the default, and the
    only value every pre-existing caller passes), behavior must be byte-for-
    byte identical to before this feature existed — no extra metadata call,
    no merge, no ffmpeg concat."""

    @patch("core.youtube_downloader.subprocess.run")
    @patch("core.youtube_downloader.get_youtube_video_info")
    @patch("yt_dlp.YoutubeDL")
    def test_whole_video_download_makes_no_extra_metadata_call_and_no_concat(
        self, mock_ydl_cls, mock_get_info, mock_subprocess_run, sample_video_info
    ):
        def side_effect_extract(url, download=True):
            opts = mock_ydl_cls.call_args[0][0]
            parent_dir = os.path.dirname(opts["outtmpl"])
            file_path = os.path.join(parent_dir, "dQw4w9WgXcQ.mp4")
            with open(file_path, "wb") as f:
                f.write(b"mock video bytes")
            return sample_video_info

        mock_ydl = MagicMock()
        mock_ydl.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = side_effect_extract
        mock_ydl.prepare_filename.return_value = "/some/path/dQw4w9WgXcQ.mp4"
        mock_ydl_cls.return_value = mock_ydl
        storage = FakeObjectStorage()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_key="k.mp4",
            storage=storage,
        )

        mock_get_info.assert_not_called()
        mock_subprocess_run.assert_not_called()
        assert "remapped_ranges" not in result
        assert len(storage.uploads) == 1
        assert mock_ydl_cls.call_args[0][0].get("download_ranges") is None
        assert "force_keyframes_at_cuts" not in mock_ydl_cls.call_args[0][0]
