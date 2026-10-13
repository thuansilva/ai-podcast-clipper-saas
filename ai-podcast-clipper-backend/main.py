"""Modal deploy wrapper for the AI Podcast Clipper pipeline.

This module is intentionally thin: it only wires up Modal infra (container
image, GPU class, secrets, volumes, auth) around the actual processing
logic, which lives in `core/` and is shared with the local dev runner
(`local_server.py`) — see `AGENTS.md` for the consolidation rationale. Keep
new processing logic in `core/`, not here.
"""

import hmac
import os
import pathlib
import shutil
import uuid

import modal
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai

from core.fonts import iter_download_commands as iter_font_download_commands
from core.moments import identify_moments as core_identify_moments
from core.moments_factory import create_moments_provider
from core.otel_setup import setup_otel
from core.rate_limit import (
    enforce_rate_limit,
    make_download_youtube_rate_limiter,
    make_process_video_rate_limiter,
)
from core.schemas import (
    DownloadYouTubeRequest,
    DownloadYouTubeResponse,
    MomentsExtraction,
    ProcessVideoRequest,
    ProcessVideoResponse,
)
from core.storage.factory import create_object_storage
from core.transcription import WhisperTranscriber
from core.video_pipeline import run_video_processing_pipeline
from core.video_probe import ManualCutExceedsVideoDurationError
from core.youtube_downloader import (
    YouTubeAgeRestrictedError,
    YouTubeInvalidHostError,
    YouTubeVideoUnavailableError,
    download_youtube_to_s3,
    remap_manual_cuts,
)

# Roda em cada cold start do container (Modal reimporta main.py do zero por
# container). Mesma função usada pelo stub local, só muda o service_name —
# ver core/otel_setup.py.
setup_otel("ai-podcast-clipper-backend")


# Every font family referenced by any subtitle preset (core/fonts.py is the
# single source of truth shared with core/subtitle_styles.py) must be
# downloaded and installed here, or ffmpeg's `ass=` filter silently
# substitutes a different font with no error (the original bug: only
# "Anton" was ever downloaded, so 6 of 11 presets rendered with the wrong
# typeface). Do not hardcode a font URL directly in this file — add it to
# core/fonts.py::FONT_FILE_DOWNLOADS instead, so main.py,
# scripts/install-fonts.sh and the test contract
# (tests/test_font_contract.py) all stay in sync.
_FONT_DOWNLOAD_COMMANDS = [
    f"wget -O /usr/share/fonts/truetype/custom/{dest} {url}"
    for dest, url in iter_font_download_commands()
]

image = (modal.Image.from_registry(
    "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install(["ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev"])
    .pip_install_from_requirements("requirements.txt")
    .run_commands(
        ["mkdir -p /usr/share/fonts/truetype/custom"]
        + _FONT_DOWNLOAD_COMMANDS
        + ["fc-cache -f -v"]
    )
    .add_local_dir("asd", "/asd", copy=True)
    # Bake the LR-ASD face detector weights into the image (the vendored code
    # would otherwise fetch them from Google Drive on every cold start, with a
    # gdown CLI flag that no longer exists). core/asd_runner.py still retries
    # at runtime if this download fails.
    .run_commands([
        "test -s /asd/model/faceDetector/s3fd/sfd_face.pth || "
        "python -c \"import gdown; gdown.download(id='1KafnHz7ccT-3IyddBsL5yi2xGtxAKypt', "
        "output='/asd/model/faceDetector/s3fd/sfd_face.pth', quiet=False)\" || "
        "echo 'WARN: sfd_face.pth download failed at build; asd_runner will retry at runtime'"
    ]))

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

ASD_DIR = "/asd"

# RNF-RL-03: per-IP throttling (defaults 10/min process_video, 30/min
# download_youtube; env-overridable — see core/rate_limit.py). In-memory, so
# on Modal these counters are PER CONTAINER: not shared between replicas and
# lost on scale-down. Best-effort against a single origin hammering a warm
# container, not a global guarantee (checklist-go-live.md documents it).
PROCESS_VIDEO_RATE_LIMITER = make_process_video_rate_limiter()
DOWNLOAD_YOUTUBE_RATE_LIMITER = make_download_youtube_rate_limiter()


# Module-level lookup at call time (not a captured reference) so tests can
# swap the limiter. Declared as the LAST parameter of each endpoint so the
# existing positional raw calls keep working; FastAPI still resolves it
# before the function body, i.e. before the Bearer token comparison — wrong
# token guesses are throttled too.
def _throttle_process_video(http_request: Request) -> None:
    enforce_rate_limit(PROCESS_VIDEO_RATE_LIMITER, http_request)


def _throttle_download_youtube(http_request: Request) -> None:
    enforce_rate_limit(DOWNLOAD_YOUTUBE_RATE_LIMITER, http_request)


@app.cls(
    gpu="L40S",
    timeout=900,
    retries=0,
    scaledown_window=20,
    # RNF/checklist (HIGH, P0): teto de custo de GPU — sem isso, um flood de
    # /process_video (token estático; o rate limit por IP — RNF-RL-03 — é
    # por container, não global) escalaria containers sem limite. Valor conservador (decisão do
    # usuário, 2026-10-12); ajustar depois com dado real de uso.
    max_containers=2,
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

        # Built unconditionally (dummy fallback key) so `self.gemini_client`
        # stays available for the legacy `identify_moments` method below even
        # when MOMENTS_PROVIDER="claude" — same "dummy_key" pattern as
        # core/moments.py's own default client builder.
        print("Creating gemini client...")
        self.gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy_key"))
        print("Created gemini client...")

        self.storage = create_object_storage()
        self.moments_provider = create_moments_provider(gemini_client=self.gemini_client)

    def identify_moments(self, transcript: list, genre: "str | None" = None) -> MomentsExtraction:
        """Thin delegate to core.moments so this stays testable/instantiable
        as a plain class (see tests/test_gemini_schema.py)."""
        return core_identify_moments(
            transcript, gemini_client=getattr(self, "gemini_client", None), genre=genre
        )

    @modal.fastapi_endpoint(method="POST")
    def process_video(
        self,
        request: ProcessVideoRequest,
        token: HTTPAuthorizationCredentials = Depends(auth_scheme),
        _throttle: None = Depends(_throttle_process_video),
    ) -> ProcessVideoResponse:
        expected_token = os.environ.get("AUTH_TOKEN") or ""
        # RNF-SEC-07: constant-time comparison (no timing side channel); bytes so a
        # non-ASCII bearer is a clean 401 instead of a TypeError/500. An empty
        # AUTH_TOKEN or bearer is always rejected (never "open by misconfig").
        if not expected_token or not token.credentials or not hmac.compare_digest(
            token.credentials.encode("utf-8"), expected_token.encode("utf-8")
        ):
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
                request=request,
                base_dir=base_dir,
                transcriber=self.transcriber,
                moments_provider=self.moments_provider,
                storage=self.storage,
                asd_dir=ASD_DIR,
            )
        except ManualCutExceedsVideoDurationError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
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
    _throttle: None = Depends(_throttle_download_youtube),
) -> DownloadYouTubeResponse:
    expected_token = os.environ.get("AUTH_TOKEN") or ""
    # RNF-SEC-07: constant-time comparison (no timing side channel); bytes so a
    # non-ASCII bearer is a clean 401 instead of a TypeError/500. An empty
    # AUTH_TOKEN or bearer is always rejected (never "open by misconfig").
    if not expected_token or not token.credentials or not hmac.compare_digest(
        token.credentials.encode("utf-8"), expected_token.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    s3_key = request.s3_key or f"youtube/{uuid.uuid4()}/original.mp4"
    # RF-PIPE-08 manual-mode partial download: when the caller sends
    # manual_cuts, only the range(s) covering them (merged, with margin) are
    # downloaded and concatenated into a single file, instead of the whole
    # video. Falsy (None/empty) behaves exactly as before this field existed.
    time_ranges = (
        [(cut.start, cut.end) for cut in request.manual_cuts] if request.manual_cuts else None
    )

    try:
        result = download_youtube_to_s3(
            url=request.url,
            s3_key=s3_key,
            storage=create_object_storage(),
            time_ranges=time_ranges,
        )
        remapped_ranges = result.get("remapped_ranges")
        remapped_cuts = (
            remap_manual_cuts(request.manual_cuts, remapped_ranges)
            if remapped_ranges and request.manual_cuts
            else None
        )
        return DownloadYouTubeResponse(
            success=True,
            s3_key=result["s3_key"],
            title=result["title"],
            duration=result["duration"],
            thumbnail=result.get("thumbnail"),
            remapped_ranges=remapped_ranges,
            remapped_cuts=remapped_cuts,
        )
    except YouTubeInvalidHostError as e:
        # RNF-SEC-06 (SSRF): non-YouTube host is a client error, rejected
        # before yt-dlp ever runs — not a generic 500.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
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
