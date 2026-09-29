import os

os.environ.setdefault("OTEL_SERVICE_NAME", "test-stub")

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_process_video_success_contract():
    response = client.post(
        "/process_video",
        json={"s3_key": "uploads/test/video.mp4", "preset": "HORMOZI"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["file_id"] == "uploads/test/video.mp4"
    assert isinstance(body["clips"], list)
    assert len(body["clips"]) == 1


def test_process_video_default_preset():
    response = client.post("/process_video", json={"s3_key": "x.mp4"})
    assert response.status_code == 200


def test_download_youtube_success_contract():
    response = client.post(
        "/download_youtube",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["s3_key"].startswith("youtube/")
    assert isinstance(body["duration"], int)


def test_download_youtube_respects_provided_s3_key():
    response = client.post(
        "/download_youtube",
        json={"url": "https://youtu.be/x", "s3_key": "custom/key.mp4"},
    )
    assert response.status_code == 200
    assert response.json()["s3_key"] == "custom/key.mp4"


def test_error_rate_forces_failure(monkeypatch):
    import main as main_module

    monkeypatch.setattr(main_module, "ERROR_RATE", 1.0)
    response = client.post("/process_video", json={"s3_key": "x.mp4"})
    assert response.status_code == 500


def test_latency_is_bounded(monkeypatch):
    import time as time_module

    import main as main_module

    monkeypatch.setattr(main_module, "LATENCY_MS_MIN", 10)
    monkeypatch.setattr(main_module, "LATENCY_MS_MAX", 20)

    start = time_module.monotonic()
    response = client.post("/process_video", json={"s3_key": "x.mp4"})
    elapsed_ms = (time_module.monotonic() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms >= 10
