"""Tests for YouTube downloader core module and Modal CPU worker endpoint."""

import os
import shutil
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from yt_dlp.utils import DownloadError

from core.schemas import DownloadYouTubeRequest, DownloadYouTubeResponse
from core.youtube_downloader import (
    YouTubeAgeRestrictedError,
    YouTubeDownloaderError,
    YouTubeVideoUnavailableError,
    download_youtube_to_s3,
    get_youtube_video_info,
)
from main import download_youtube


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
    def test_download_success_with_mock_s3(self, mock_ydl_cls, sample_video_info):
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

        mock_s3 = MagicMock()

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_bucket="my-test-bucket",
            s3_key="uploads/podcast.mp4",
            s3_client=mock_s3,
        )

        assert result["s3_key"] == "uploads/podcast.mp4"
        assert result["title"] == "Never Gonna Give You Up"
        assert result["duration"] == 212
        assert result["thumbnail"] == "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"

        mock_s3.upload_file.assert_called_once()
        uploaded_file, bucket, key = mock_s3.upload_file.call_args[0]
        assert uploaded_file.endswith("dQw4w9WgXcQ.mp4")
        assert bucket == "my-test-bucket"
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

        mock_s3 = MagicMock()

        with pytest.raises(YouTubeDownloaderError):
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=fail",
                s3_bucket="bucket",
                s3_key="key.mp4",
                s3_client=mock_s3,
            )

        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])

    @patch("yt_dlp.YoutubeDL")
    def test_download_cleans_up_temp_dir_on_s3_upload_failure(
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

        mock_s3 = MagicMock()
        mock_s3.upload_file.side_effect = RuntimeError("S3 connection timed out")

        with pytest.raises(YouTubeDownloaderError) as exc_info:
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                s3_bucket="bucket",
                s3_key="key.mp4",
                s3_client=mock_s3,
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

        mock_s3 = MagicMock()

        with pytest.raises(YouTubeDownloaderError) as exc_info:
            download_youtube_to_s3(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                s3_bucket="bucket",
                s3_key="key.mp4",
                s3_client=mock_s3,
            )

        assert "found" in str(exc_info.value).lower()
        assert len(recorded_temp_dir) == 1
        assert not os.path.exists(recorded_temp_dir[0])

    @patch("boto3.client")
    @patch("yt_dlp.YoutubeDL")
    def test_download_defaults_to_boto3_client_when_none(
        self, mock_ydl_cls, mock_boto3_client, sample_video_info
    ):
        mock_s3 = MagicMock()
        mock_boto3_client.return_value = mock_s3

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

        result = download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_bucket="default-bucket",
            s3_key="default-key.mp4",
            s3_client=None,
        )

        mock_boto3_client.assert_called_once_with("s3")
        mock_s3.upload_file.assert_called_once()
        assert result["s3_key"] == "default-key.mp4"

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
        mock_s3 = MagicMock()

        download_youtube_to_s3(
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            s3_bucket="b",
            s3_key="k.mp4",
            s3_client=mock_s3,
        )

        call_opts = mock_ydl_cls.call_args[0][0]
        expected_format = (
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/"
            "best[height<=1080][ext=mp4]/best"
        )
        assert call_opts["format"] == expected_format
        assert call_opts["merge_output_format"] == "mp4"


class TestDownloadYouTubeEndpoint:
    def _get_raw_endpoint(self):
        if hasattr(download_youtube, "local"):
            return download_youtube.local
        if hasattr(download_youtube, "get_raw_f"):
            return download_youtube.get_raw_f()
        return download_youtube

    @patch("main.download_youtube_to_s3")
    def test_endpoint_success(self, mock_download):
        mock_download.return_value = {
            "s3_key": "youtube/vid123/original.mp4",
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
                s3_bucket="custom-bucket",
                s3_key="youtube/vid123/original.mp4",
            )
            resp = endpoint_fn(request=req, token=token)

            assert isinstance(resp, DownloadYouTubeResponse)
            assert resp.success is True
            assert resp.s3_key == "youtube/vid123/original.mp4"
            assert resp.title == "Exciting Podcast"
            assert resp.duration == 360
            assert resp.thumbnail == "https://img.youtube.com/vi/vid123/hqdefault.jpg"

    @patch("main.download_youtube_to_s3")
    def test_endpoint_generates_s3_key_if_omitted(self, mock_download):
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
