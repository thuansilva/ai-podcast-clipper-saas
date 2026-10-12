"""WhisperX-based transcription, shared by the Modal pipeline and the local
dev runner.

Model size/device/compute type are parameterized (production uses
`large-v2`/`cuda`/`float16`; the local dev runner can point at a smaller
model via env vars to fit in less VRAM) but the loading/inference logic
itself is identical, to avoid drift between the two runners.
"""

import json
import pathlib
import subprocess
import time

try:
    import whisperx
except ImportError:
    whisperx = None

# `RANGE_MARGIN_SECONDS` and `merge_time_ranges` used to be defined here.
# They moved to `core/time_ranges.py` so `core/youtube_downloader.py`'s
# manual-mode partial download can reuse the exact same merge logic instead
# of a parallel implementation (see that module's docstring). Re-exported
# here, unchanged, so every existing `from core.transcription import
# merge_time_ranges, RANGE_MARGIN_SECONDS` keeps working.
from core.time_ranges import RANGE_MARGIN_SECONDS, merge_time_ranges

__all__ = ["WhisperTranscriber", "RANGE_MARGIN_SECONDS", "merge_time_ranges"]


class WhisperTranscriber:
    """Loads WhisperX transcription + alignment models and transcribes clips."""

    def __init__(
        self,
        model_name: str = "large-v2",
        device: str = "cuda",
        compute_type: str = "float16",
        language_code: str = "en",
        batch_size: int = 16,
    ):
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.language_code = language_code
        self.batch_size = batch_size
        self.model = None
        self.alignment_model = None
        self.metadata = None

    def load(self) -> None:
        print("Loading WhisperX models...")
        self.model = whisperx.load_model(
            self.model_name, device=self.device, compute_type=self.compute_type
        )
        self.alignment_model, self.metadata = whisperx.load_align_model(
            language_code=self.language_code,
            device=self.device,
        )
        print("Transcription models loaded...")

    def transcribe(self, base_dir: pathlib.Path, video_path: pathlib.Path) -> str:
        """Extract audio from `video_path`, transcribe and word-align it.

        Returns a JSON string with a list of `{start, end, word}` segments.
        """
        audio_path = base_dir / "audio.wav"
        extract_cmd = (
            f"ffmpeg -i {video_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        )
        subprocess.run(extract_cmd, shell=True, check=True, capture_output=True)

        print("Starting transcription with WhisperX...")
        start_time = time.time()

        audio = whisperx.load_audio(str(audio_path))
        result = self.model.transcribe(audio, batch_size=self.batch_size)

        result = whisperx.align(
            result["segments"],
            self.alignment_model,
            self.metadata,
            audio,
            device=self.device,
            return_char_alignments=False,
        )

        duration = time.time() - start_time
        print(f"Transcription and alignment took {duration:.2f} seconds")

        segments = []
        if "word_segments" in result:
            for word_segment in result["word_segments"]:
                segments.append({
                    "start": word_segment["start"],
                    "end": word_segment["end"],
                    "word": word_segment["word"],
                })

        return json.dumps(segments)

    def transcribe_range(
        self,
        base_dir: pathlib.Path,
        video_path: pathlib.Path,
        start: float,
        end: float,
    ) -> str:
        """Transcribe only `[start, end]` (seconds) of `video_path`.

        Used by the manual mode so the GPU does not transcribe the whole
        video. Word times are shifted by `start`, so they stay absolute
        relative to the original video, same as `transcribe`.
        """
        audio_path = base_dir / f"audio_{int(start * 1000)}_{int(end * 1000)}.wav"
        extract_cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", str(video_path),
            "-t", str(end - start),
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            str(audio_path),
        ]
        subprocess.run(extract_cmd, shell=False, check=True, capture_output=True)

        audio = whisperx.load_audio(str(audio_path))
        result = self.model.transcribe(audio, batch_size=self.batch_size)
        result = whisperx.align(
            result["segments"],
            self.alignment_model,
            self.metadata,
            audio,
            device=self.device,
            return_char_alignments=False,
        )

        segments = []
        for word_segment in result.get("word_segments", []):
            if "start" not in word_segment or "end" not in word_segment:
                continue
            segments.append({
                "start": word_segment["start"] + start,
                "end": word_segment["end"] + start,
                "word": word_segment["word"],
            })
        return json.dumps(segments)
