"""Modal deploy wrapper for the AI Podcast Clipper pipeline.

This module is intentionally thin: it only wires up Modal infra (container
image, GPU class, secrets, volumes, auth) around the actual processing
logic, which lives in `core/` and is shared with the local dev runner
(`local_server.py`) — see `AGENTS.md` for the consolidation rationale. Keep
new processing logic in `core/`, not here.
"""

import os
import pathlib
import shutil
import uuid

import modal
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai

from core.moments import identify_moments as core_identify_moments
from core.otel_setup import setup_otel
from core.schemas import (
    DownloadYouTubeRequest,
    DownloadYouTubeResponse,
    MomentsExtraction,
    ProcessVideoRequest,
    ProcessVideoResponse,
)
from core.transcription import WhisperTranscriber
from core.video_pipeline import run_video_processing_pipeline
from core.youtube_downloader import (
    YouTubeAgeRestrictedError,
    YouTubeVideoUnavailableError,
    download_youtube_to_s3,
)

# Roda em cada cold start do container (Modal reimporta main.py do zero por
# container). Mesma função usada pelo stub local, só muda o service_name —
# ver core/otel_setup.py.
setup_otel("ai-podcast-clipper-backend")


image = (modal.Image.from_registry(
    "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install(["ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev"])
    .pip_install_from_requirements("requirements.txt")
    .run_commands(["mkdir -p /usr/share/fonts/truetype/custom",
                   "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf",
                   "fc-cache -f -v"])
    .add_local_dir("asd", "/asd", copy=True))

cpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(["ffmpeg"])
    .pip_install([
        "yt-dlp", "boto3", "fastapi[standard]", "pydantic",
        "opentelemetry-api", "opentelemetry-sdk",
        "opentelemetry-instrumentation-fastapi",
        "opentelemetry-exporter-otlp-proto-http",
    ])
)

app = modal.App("ai-podcast-clipper", image=image)

volume = modal.Volume.from_name(
    "ai-podcast-clipper-model-cache", create_if_missing=True
)

mount_path = "/root/.cache/torch"

auth_scheme = HTTPBearer()

S3_BUCKET = "ai-podcast-clipper"
ASD_DIR = "/asd"


@app.cls(
    gpu="L40S",
    timeout=900,
    retries=0,
    scaledown_window=20,
    secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")],
    volumes={mount_path: volume},
)
class AiPodcastClipper:
    @modal.enter()
    def load_model(self):
        print("Loading models")

        self.transcriber = WhisperTranscriber(
            model_name="large-v2", device="cuda", compute_type="float16"
        )
        self.transcriber.load()

        print("Creating gemini client...")
        self.gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        print("Created gemini client...")

    def identify_moments(self, transcript: list) -> MomentsExtraction:
        """Thin delegate to core.moments so this stays testable/instantiable
        as a plain class (see tests/test_gemini_schema.py)."""
        return core_identify_moments(
            transcript, gemini_client=getattr(self, "gemini_client", None)
        )

    @modal.fastapi_endpoint(method="POST")
    def process_video(
        self,
        request: ProcessVideoRequest,
        token: HTTPAuthorizationCredentials = Depends(auth_scheme),
    ) -> ProcessVideoResponse:
        if token.credentials != os.environ.get("AUTH_TOKEN"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)

        try:
            return run_video_processing_pipeline(
                s3_key=request.s3_key,
                preset=request.preset or "HORMOZI",
                base_dir=base_dir,
                transcriber=self.transcriber,
                gemini_client=self.gemini_client,
                s3_bucket=S3_BUCKET,
                asd_dir=ASD_DIR,
            )
        finally:
            if base_dir.exists():
                print(f"Cleaning up temp dir {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)


@app.function(
    image=cpu_image,
    timeout=600,
    secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")],
)
@modal.fastapi_endpoint(method="POST")
def download_youtube(
    request: DownloadYouTubeRequest,
    token: HTTPAuthorizationCredentials = Depends(auth_scheme),
) -> DownloadYouTubeResponse:
    if token.credentials != os.environ.get("AUTH_TOKEN"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    s3_key = request.s3_key or f"youtube/{uuid.uuid4()}/original.mp4"

    try:
        result = download_youtube_to_s3(
            url=request.url,
            s3_bucket=request.s3_bucket,
            s3_key=s3_key,
        )
        return DownloadYouTubeResponse(
            success=True,
            s3_key=result["s3_key"],
            title=result["title"],
            duration=result["duration"],
            thumbnail=result.get("thumbnail"),
        )
    except YouTubeVideoUnavailableError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"YouTube video unavailable: {str(e)}",
        )
    except YouTubeAgeRestrictedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"YouTube video is age-restricted: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download YouTube video: {str(e)}",
        )


@app.local_entrypoint()
def main():
    import requests

    ai_podcast_clipper = AiPodcastClipper()

    url = ai_podcast_clipper.process_video.web_url

    payload = {
        "s3_key": "test2/mi630min.mp4",
        "preset": "HORMOZI",
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer 123123",
    }

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    result = response.json()
    print(result)
