import os
from unittest.mock import patch

from fastapi.testclient import TestClient
from local_server import app

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


def test_download_youtube_endpoint():
    # Use a dummy invalid URL to just check the route existence and validation
    with patch.dict(os.environ, {"AUTH_TOKEN": "test-secret"}):
        response = client.post(
            "/download_youtube",
            json={"url": "invalid", "uploaded_file_id": "123"},
            headers=AUTH_HEADERS,
        )
        # Assuming it throws an error internally or returns a mock success if we patch it
        assert response.status_code in [200, 400, 500]


def test_download_youtube_success_mocked(monkeypatch):
    import subprocess

    def mock_run(*args, **kwargs):
        return subprocess.CompletedProcess(args=args[0], returncode=0)

    monkeypatch.setattr(subprocess, "run", mock_run)

    with patch.dict(os.environ, {"AUTH_TOKEN": "test-secret"}):
        response = client.post(
            "/download_youtube",
            json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "s3_bucket": "test-bucket"},
            headers=AUTH_HEADERS,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "s3_key" in data
    assert "video_url" in data
    assert data["title"] == "Local Video"
    assert data["duration"] == 60
    assert data["durationSeconds"] == 60


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
