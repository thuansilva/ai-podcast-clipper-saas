"""Local GPU dev runner for the AI Podcast Clipper pipeline.

Thin FastAPI wrapper used to run the pipeline on your own GPU during
development, without spending Modal credits. Like `main.py` (the Modal
deploy wrapper), this module is intentionally thin: the actual processing
logic (transcription, active speaker detection, vertical crop, subtitles,
S3 upload) lives in `core/` and is shared by both runners — see `AGENTS.md`
for the consolidation rationale. The only things that belong here are:

  - FastAPI app/auth/env-var wiring (vs. Modal decorators/secrets in
    `main.py`).
  - The torchaudio/pyannote/pytorch compatibility monkey-patches below,
    which are a local-environment concern (recent PyTorch defaults that
    break whisperx/pyannote on a dev machine) and have nothing to do with
    pipeline logic.

Run with: `python local_server.py` (uvicorn on 0.0.0.0:8000).
"""

import hmac
import os
import uuid

os.environ.setdefault("TORCH_HOME", "/tmp/ai-podcast-clipper-models")

from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

auth_scheme = HTTPBearer()


def verify_auth_token(token: HTTPAuthorizationCredentials = Depends(auth_scheme)) -> None:
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


# --- Local-only compatibility shims (must run before whisperx/pyannote get
# imported anywhere below, including transitively via core.transcription) ---

# Monkey-patch torchaudio para retrocompatibilidade com pyannote.audio e whisperx
import torchaudio
import soundfile as sf

if not hasattr(torchaudio, "AudioMetaData"):
    class AudioMetaData:
        def __init__(self, sample_rate, num_frames, num_channels, bits_per_sample, encoding):
            self.sample_rate = sample_rate
            self.num_frames = num_frames
            self.num_channels = num_channels
            self.bits_per_sample = bits_per_sample
            self.encoding = encoding
    torchaudio.AudioMetaData = AudioMetaData

if not hasattr(torchaudio, "info"):
    def _mock_info(uri, *args, **kwargs):
        info = sf.info(uri)
        return AudioMetaData(
            sample_rate=info.samplerate,
            num_frames=info.frames,
            num_channels=info.channels,
            bits_per_sample=16,
            encoding=info.subtype
        )
    torchaudio.info = _mock_info

if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"]
if not hasattr(torchaudio, "get_audio_backend"):
    torchaudio.get_audio_backend = lambda: "soundfile"

# PyTorch 2.6 defaults weights_only=True which breaks pyannote/whisperx loading.
import torch
import torch.serialization
import omegaconf.listconfig
import omegaconf.dictconfig
import omegaconf.base
import pyannote.audio.core.model
import pytorch_lightning.callbacks.model_checkpoint

try:
    torch.serialization.add_safe_globals([
        omegaconf.listconfig.ListConfig,
        omegaconf.dictconfig.DictConfig,
        omegaconf.base.ContainerMetadata,
        omegaconf.base.Metadata,
        pyannote.audio.core.model.Model,
        pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint
    ])
except Exception as e:
    print("Warning: Failed to add safe globals:", e)

# Hard override of torch.load internal functions just in case
_original_load = torch.serialization.load
def _mock_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_load(*args, **kwargs)
torch.serialization.load = _mock_load
torch.load = _mock_load

# --- End of compatibility shims ---

from dotenv import load_dotenv

load_dotenv()

from google import genai

from core.moments_factory import create_moments_provider
from core.schemas import (
    DownloadYouTubeRequest,
    DownloadYouTubeResponse,
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
)

import pathlib
import shutil

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "ai-podcast-clipper")
ASD_DIR = os.environ.get("ASD_DIR", "/asd")

app = FastAPI(title="Local Podcast Clipper Backend")


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/download_youtube")
def download_youtube(
    req: DownloadYouTubeRequest, _: None = Depends(verify_auth_token)
) -> DownloadYouTubeResponse:
    # Same contract and same shared logic as main.py's download_youtube
    # (RNF-SEC-06/18): `download_youtube_to_s3` validates the host (SSRF),
    # downloads with yt-dlp and uploads through the pluggable storage (MinIO
    # in local dev, see core/storage/factory.py). No local-file shortcut: the
    # returned s3_key is always a real storage key, never a /tmp path.
    s3_key = req.s3_key or f"youtube/{uuid.uuid4()}/original.mp4"

    try:
        result = download_youtube_to_s3(
            url=req.url,
            s3_key=s3_key,
            storage=create_object_storage(),
        )
        return DownloadYouTubeResponse(
            success=True,
            s3_key=result["s3_key"],
            title=result["title"],
            duration=result["duration"],
            thumbnail=result.get("thumbnail"),
        )
    except YouTubeInvalidHostError as e:
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


class LocalVideoProcessor:
    """Lazily loads the shared WhisperX transcriber + Gemini client, sized
    for a local GPU via env vars instead of the fixed prod config Modal
    uses (see `main.py`), then delegates to the shared `core` pipeline."""

    def __init__(self):
        self.transcriber: Optional[WhisperTranscriber] = None
        self.gemini_client = None
        self.moments_provider = None
        self.storage = None

    def load_model(self) -> None:
        print("Loading models (configurable via WHISPER_* env vars for local VRAM budgets)")
        self.transcriber = WhisperTranscriber(
            model_name=os.environ.get("WHISPER_MODEL", "small"),
            device=os.environ.get("WHISPER_DEVICE", "cuda"),
            compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "float16"),
            batch_size=4,
        )
        self.transcriber.load()
        print("Transcription models loaded...")

        # Built unconditionally (dummy fallback key), same reasoning as
        # main.py: keeps a Gemini client around even when MOMENTS_PROVIDER
        # is set to "claude".
        print("Creating gemini client...")
        self.gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy_key"))
        print("Created gemini client...")

        self.storage = create_object_storage()
        self.moments_provider = create_moments_provider(gemini_client=self.gemini_client)

    def process_video(self, request: ProcessVideoRequest) -> ProcessVideoResponse:
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
        finally:
            if base_dir.exists():
                print(f"Cleaning up temp dir {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)


video_processor = LocalVideoProcessor()
models_loaded = False


@app.post("/process_video")
def process_video_endpoint(req: ProcessVideoRequest, _: None = Depends(verify_auth_token)):
    global models_loaded
    try:
        if not models_loaded:
            video_processor.load_model()
            models_loaded = True

        return video_processor.process_video(req)
    except ManualCutExceedsVideoDurationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
