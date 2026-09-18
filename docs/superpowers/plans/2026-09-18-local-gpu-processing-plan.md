# Local GPU Video Processing Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone, isolated FastAPI server (`local_server.py`) for local GPU video processing, bypassing the Modal cloud infrastructure for testing.

**Architecture:** A single, isolated `local_server.py` script running a FastAPI app. It replicates the functionality of `main.py` but strips all Modal decorators and references, using local file paths instead of Modal Volumes. The file is untracked by Git.

**Tech Stack:** Python 3, FastAPI, Uvicorn, ffmpegcv, torch, pysubs2.

**Spec:** `docs/superpowers/specs/2026-09-18-local-gpu-processing-design.md`

## Global Constraints
- **CRITICAL:** NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário. (Deixe as alterações no working tree).
- `local_server.py` MUST be added to `.gitignore`.
- Production code (`main.py`, `core/*`) MUST NOT be modified.

---

### Task 1: Scaffolding & Gitignore

**Files:**
- Modify: `ai-podcast-clipper-backend/.gitignore`
- Create: `ai-podcast-clipper-backend/local_server.py`
- Create: `ai-podcast-clipper-backend/tests/test_local_server.py`

**Interfaces:**
- Produces: `local_server.py` running a FastAPI app with mocked `/download_youtube` and `/process_video` endpoints.

- [ ] **Step 1: Write the failing test**

```python
# ai-podcast-clipper-backend/tests/test_local_server.py
from fastapi.testclient import TestClient
from local_server import app

client = TestClient(app)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py`
Expected: FAIL with ModuleNotFoundError: No module named 'local_server'

- [ ] **Step 3: Write minimal implementation and update gitignore**

```python
# ai-podcast-clipper-backend/local_server.py
from fastapi import FastAPI
import uvicorn

app = FastAPI(title="Local Podcast Clipper Backend")

@app.get("/")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```
Add `local_server.py` and `tests/test_local_server.py` to `ai-podcast-clipper-backend/.gitignore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py`
Expected: PASS

- [ ] **Step 5: Verify Working Tree (No Commit)**
Run `git status` to ensure `local_server.py` is ignored and NO commit is made.

---

### Task 2: Implement `/download_youtube` Endpoint Locally

**Files:**
- Modify: `ai-podcast-clipper-backend/local_server.py`
- Modify: `ai-podcast-clipper-backend/tests/test_local_server.py`

**Interfaces:**
- Produces: `POST /download_youtube` taking `{"url": "...", "uploaded_file_id": "..."}` and downloading the file to a local temp folder.

- [ ] **Step 1: Write the failing test**

```python
# ai-podcast-clipper-backend/tests/test_local_server.py (append)
def test_download_youtube_endpoint():
    # Use a dummy invalid URL to just check the route existence and validation
    response = client.post("/download_youtube", json={"url": "invalid", "uploaded_file_id": "123"})
    # Assuming it throws an error internally or returns a mock success if we patch it
    assert response.status_code in [200, 400, 500] 
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py::test_download_youtube_endpoint`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Write minimal implementation**

```python
# ai-podcast-clipper-backend/local_server.py (append)
from pydantic import BaseModel
import os
import subprocess
import uuid

class DownloadRequest(BaseModel):
    url: str
    uploaded_file_id: str

@app.post("/download_youtube")
def download_youtube(req: DownloadRequest):
    output_dir = "/tmp/ai-podcast-clipper"
    os.makedirs(output_dir, exist_ok=True)
    temp_filename = f"{uuid.uuid4().hex}.mp4"
    temp_filepath = os.path.join(output_dir, temp_filename)
    
    # Adapted from original yt-dlp logic
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o", temp_filepath,
        req.url
    ]
    subprocess.run(cmd, check=True)
    
    # In local mode, we'll just return the local path instead of S3 upload for simplicity
    # or you can upload to S3 if configured. For testing, return local path.
    return {"s3_key": temp_filepath, "video_url": temp_filepath, "title": "Local Video", "durationSeconds": 60}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py::test_download_youtube_endpoint`
Expected: PASS

- [ ] **Step 5: Verify Working Tree (No Commit)**
Leave in working tree.

---

### Task 3: Implement `/process_video` Endpoint Locally

**Files:**
- Modify: `ai-podcast-clipper-backend/local_server.py`
- Modify: `ai-podcast-clipper-backend/tests/test_local_server.py`

**Interfaces:**
- Produces: `POST /process_video` handling Whisper transcription and ffmpeg cutting using local GPU.

- [ ] **Step 1: Write the failing test**

```python
# ai-podcast-clipper-backend/tests/test_local_server.py (append)
def test_process_video_endpoint():
    response = client.post("/process_video", json={
        "video_url": "/tmp/fake.mp4",
        "uploaded_file_id": "123",
        "user_id": "user123"
    })
    # As long as it hits the endpoint and fails with validation or internal logic, route exists
    assert response.status_code in [200, 422, 500]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py::test_process_video_endpoint`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Write minimal implementation**

```python
# ai-podcast-clipper-backend/local_server.py (append)
from typing import Optional

class ProcessVideoRequest(BaseModel):
    video_url: str
    uploaded_file_id: str
    user_id: str
    durationSeconds: Optional[int] = None
    clips_to_generate: int = 3

@app.post("/process_video")
def process_video(req: ProcessVideoRequest):
    # This acts as a mock/proxy structure. 
    # Real implementation inside this step will copy `transcribe_video`, `identify_moments`, 
    # and `create_vertical_video` from main.py and adapt paths to use /tmp/
    return {"status": "success", "message": "Processed locally"}
```
*(Implementer Note: In Step 3, you MUST copy the exact internal implementations of `create_vertical_video`, `process_clip`, and the `VideoProcessor` logic from `main.py` into `local_server.py`, but remove all `@app.function` and `modal.Volume` lines. Use `/tmp/ai-podcast-clipper-models` instead of Modal cache).*

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-podcast-clipper-backend && pytest tests/test_local_server.py::test_process_video_endpoint`
Expected: PASS

- [ ] **Step 5: Verify Working Tree (No Commit)**
Leave in working tree.
