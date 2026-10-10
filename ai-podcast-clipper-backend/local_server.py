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
import sys
import uuid

os.environ.setdefault("TORCH_HOME", "/tmp/ai-podcast-clipper-models")

import subprocess
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

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

from core.schemas import ProcessVideoRequest, ProcessVideoResponse
from core.transcription import WhisperTranscriber
from core.video_pipeline import run_video_processing_pipeline
from core.video_probe import ManualCutExceedsVideoDurationError

import pathlib
import shutil

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "ai-podcast-clipper")
ASD_DIR = os.environ.get("ASD_DIR", "/asd")

app = FastAPI(title="Local Podcast Clipper Backend")


class DownloadRequest(BaseModel):
    url: str
    uploaded_file_id: Optional[str] = None
    s3_bucket: Optional[str] = "ai-podcast-clipper"
    s3_key: Optional[str] = None


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/download_youtube")
def download_youtube(req: DownloadRequest, _: None = Depends(verify_auth_token)):
    # Local convenience: skip the S3 round-trip during dev iteration and
    # just keep the downloaded file on disk, so this intentionally diverges
    # from main.py's download_youtube (which always uploads to S3) — that's
    # a deploy/infra difference, not pipeline logic.
    output_dir = "/tmp/ai-podcast-clipper"
    os.makedirs(output_dir, exist_ok=True)
    temp_filename = f"{uuid.uuid4().hex}.mp4"
    temp_filepath = os.path.join(output_dir, temp_filename)

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o",
        temp_filepath,
        req.url,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"yt-dlp download failed: {e.stderr or e.stdout or str(e)}",
        )

    return {
        "success": True,
        "s3_key": temp_filepath,
        "video_url": temp_filepath,
        "title": "Local Video",
        "duration": 60,
        "durationSeconds": 60,
        "thumbnail": None,
    }


class LocalVideoProcessor:
    """Lazily loads the shared WhisperX transcriber + Gemini client, sized
    for a local GPU via env vars instead of the fixed prod config Modal
    uses (see `main.py`), then delegates to the shared `core` pipeline."""

    def __init__(self):
        self.transcriber: Optional[WhisperTranscriber] = None
        self.gemini_client = None

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

        print("Creating gemini client...")
        self.gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        print("Created gemini client...")

    def process_video(self, request: ProcessVideoRequest) -> ProcessVideoResponse:
        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)

        try:
            return run_video_processing_pipeline(
                request=request,
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
