import glob
import json
import os
import pathlib
import pickle
import shutil
import subprocess
import time
import uuid

import boto3
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai
from google.genai import types
import modal
import numpy as np
import pysubs2
from tqdm import tqdm

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import ffmpegcv
except ImportError:
    ffmpegcv = None

try:
    import whisperx
except ImportError:
    whisperx = None

from core.schemas import (
    ClipItem,
    DownloadYouTubeRequest,
    DownloadYouTubeResponse,
    MomentsExtraction,
    ProcessVideoRequest,
    ProcessVideoResponse,
)
from core.subtitle_styles import generate_ass_subtitles
from core.youtube_downloader import (
    YouTubeAgeRestrictedError,
    YouTubeVideoUnavailableError,
    download_youtube_to_s3,
    get_youtube_video_info,
)


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
    .pip_install(["yt-dlp", "boto3", "fastapi[standard]", "pydantic"])
)

app = modal.App("ai-podcast-clipper", image=image)

volume = modal.Volume.from_name(
    "ai-podcast-clipper-model-cache", create_if_missing=True
)

mount_path = "/root/.cache/torch"

auth_scheme = HTTPBearer()


def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25):
    target_width = 1080
    target_height = 1920

    flist = glob.glob(os.path.join(pyframes_path, "*.jpg"))
    flist.sort()

    faces = [[] for _ in range(len(flist))]

    for tidx, track in enumerate(tracks):
        score_array = scores[tidx]
        for fidx, frame in enumerate(track["track"]["frame"].tolist()):
            slice_start = max(fidx - 30, 0)
            slice_end = min(fidx + 30, len(score_array))
            score_slice = score_array[slice_start:slice_end]
            avg_score = float(np.mean(score_slice)
                              if len(score_slice) > 0 else 0)

            faces[frame].append(
                {'track': tidx, 'score': avg_score, 's': track['proc_track']["s"][fidx], 'x': track['proc_track']["x"][fidx], 'y': track['proc_track']["y"][fidx]})

    temp_video_path = os.path.join(pyavi_path, "video_only.mp4")

    vout = None
    for fidx, fname in tqdm(enumerate(flist), total=len(flist), desc="Creating vertical video"):
        img = cv2.imread(fname)
        if img is None:
            continue

        current_faces = faces[fidx]

        max_score_face = max(
            current_faces, key=lambda face: face['score']) if current_faces else None

        if max_score_face and max_score_face['score'] < 0:
            max_score_face = None

        if vout is None:
            vout = ffmpegcv.VideoWriterNV(
                file=temp_video_path,
                codec=None,
                fps=framerate,
                resize=(target_width, target_height)
            )

        if max_score_face:
            mode = "crop"
        else:
            mode = "resize"

        if mode == "resize":
            scale = target_width / img.shape[1]
            resized_height = int(img.shape[0] * scale)
            resized_image = cv2.resize(
                img, (target_width, resized_height), interpolation=cv2.INTER_AREA)

            scale_for_bg = max(
                target_width / img.shape[1], target_height / img.shape[0])
            bg_width = int(img.shape[1] * scale_for_bg)
            bg_heigth = int(img.shape[0] * scale_for_bg)

            blurred_background = cv2.resize(img, (bg_width, bg_heigth))
            blurred_background = cv2.GaussianBlur(
                blurred_background, (121, 121), 0)

            crop_x = (bg_width - target_width) // 2
            crop_y = (bg_heigth - target_height) // 2
            blurred_background = blurred_background[crop_y:crop_y +
                                                    target_height, crop_x:crop_x + target_width]

            center_y = (target_height - resized_height) // 2
            blurred_background[center_y:center_y +
                               resized_height, :] = resized_image

            vout.write(blurred_background)

        elif mode == "crop":
            scale = target_height / img.shape[0]
            resized_image = cv2.resize(
                img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            frame_width = resized_image.shape[1]

            center_x = int(
                max_score_face["x"] * scale if max_score_face else frame_width // 2)
            top_x = max(min(center_x - target_width // 2,
                        frame_width - target_width), 0)

            image_cropped = resized_image[0:target_height,
                                          top_x:top_x + target_width]

            vout.write(image_cropped)

    if vout:
        vout.release()

    ffmpeg_command = (f"ffmpeg -y -i {temp_video_path} -i {audio_path} "
                      f"-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128k "
                      f"{output_path}")
    subprocess.run(ffmpeg_command, shell=True, check=True, text=True)


def create_subtitles_with_ffmpeg(
    transcript_segments: list,
    clip_start: float,
    clip_end: float,
    clip_video_path: str,
    output_path: str,
    preset: str = "HORMOZI",
    max_words: int = 5,
):
    """Generate styled subtitles with pysubs2 preset and burn them via ffmpeg."""
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, f"subtitles_{preset.lower()}.ass")

    generate_ass_subtitles(
        transcript_segments=transcript_segments,
        clip_start=clip_start,
        clip_end=clip_end,
        output_path=subtitle_path,
        preset=preset,
        max_words=max_words,
    )

    ffmpeg_cmd = (
        f'ffmpeg -y -i {clip_video_path} -vf "ass={subtitle_path}" '
        f'-c:v h264 -preset fast -crf 23 {output_path}'
    )
    subprocess.run(ffmpeg_cmd, shell=True, check=True)


def process_clip(
    base_dir: pathlib.Path,
    original_video_path: pathlib.Path,
    s3_key: str,
    start_time: float,
    end_time: float,
    clip_index: int,
    transcript_segments: list,
    preset: str = "HORMOZI",
    clip_item: ClipItem | None = None,
) -> dict:
    clip_name = f"clip_{clip_index}"
    s3_key_dir = os.path.dirname(s3_key)
    output_s3_key = f"{s3_key_dir}/{clip_name}.mp4"
    print(f"Output S3 key: {output_s3_key}")

    clip_dir = base_dir / clip_name
    clip_dir.mkdir(parents=True, exist_ok=True)

    clip_segment_path = clip_dir / f"{clip_name}_segment.mp4"
    vertical_mp4_path = clip_dir / "pyavi" / "video_out_vertical.mp4"
    subtitle_output_path = clip_dir / "pyavi" / "video_with_subtitles.mp4"

    (clip_dir / "pywork").mkdir(exist_ok=True)
    pyframes_path = clip_dir / "pyframes"
    pyavi_path = clip_dir / "pyavi"
    audio_path = clip_dir / "pyavi" / "audio.wav"

    pyframes_path.mkdir(exist_ok=True)
    pyavi_path.mkdir(exist_ok=True)

    duration = end_time - start_time
    # 1. Cut ONLY the clip slice from the original video
    cut_command = (
        f"ffmpeg -y -i {original_video_path} -ss {start_time} -t {duration} "
        f"{clip_segment_path}"
    )
    subprocess.run(cut_command, shell=True, check=True, capture_output=True, text=True)

    # 2. Extract audio for LR-ASD from the cut segment
    extract_cmd = (
        f"ffmpeg -y -i {clip_segment_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
    )
    subprocess.run(extract_cmd, shell=True, check=True, capture_output=True)

    shutil.copy(clip_segment_path, base_dir / f"{clip_name}.mp4")

    # 3. LR-ASD (Columbia) runs ONLY on this specific 30-60s clip, not the full video
    columbia_command = (
        f"python Columbia_test.py --videoName {clip_name} "
        f"--videoFolder {str(base_dir)} "
        f"--pretrainModel weight/finetuning_TalkSet.model"
    )

    columbia_start_time = time.time()
    subprocess.run(columbia_command, cwd="/asd", shell=True)
    columbia_end_time = time.time()
    print(
        f"Columbia LR-ASD script completed in {columbia_end_time - columbia_start_time:.2f} seconds"
    )

    tracks_path = clip_dir / "pywork" / "tracks.pckl"
    scores_path = clip_dir / "pywork" / "scores.pckl"
    if not tracks_path.exists() or not scores_path.exists():
        raise FileNotFoundError("Tracks or scores not found for clip")

    with open(tracks_path, "rb") as f:
        tracks = pickle.load(f)

    with open(scores_path, "rb") as f:
        scores = pickle.load(f)

    cvv_start_time = time.time()
    create_vertical_video(
        tracks, scores, pyframes_path, pyavi_path, audio_path, vertical_mp4_path
    )
    cvv_end_time = time.time()
    print(
        f"Clip {clip_index} vertical video creation time: {cvv_end_time - cvv_start_time:.2f} seconds"
    )

    # 4. Generate subtitles with chosen preset and burn to video
    create_subtitles_with_ffmpeg(
        transcript_segments=transcript_segments,
        clip_start=start_time,
        clip_end=end_time,
        clip_video_path=str(vertical_mp4_path),
        output_path=str(subtitle_output_path),
        preset=preset,
        max_words=5,
    )

    s3_client = boto3.client("s3")
    s3_client.upload_file(
        str(subtitle_output_path), "ai-podcast-clipper", output_s3_key
    )

    clip_metadata = {
        "clip_index": clip_index,
        "s3_key": output_s3_key,
        "start": start_time,
        "end": end_time,
        "duration": duration,
        "preset": preset,
    }
    if clip_item:
        clip_metadata.update({
            "title": clip_item.title,
            "hook": clip_item.hook,
            "virality_score": clip_item.virality_score,
            "reason": clip_item.reason,
        })
    return clip_metadata


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

        self.whisperx_model = whisperx.load_model(
            "large-v2", device="cuda", compute_type="float16"
        )

        self.alignment_model, self.metadata = whisperx.load_align_model(
            language_code="en",
            device="cuda",
        )

        print("Transcription models loaded...")

        print("Creating gemini client...")
        self.gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        print("Created gemini client...")

    def transcribe_video(self, base_dir: pathlib.Path, video_path: pathlib.Path) -> str:
        audio_path = base_dir / "audio.wav"
        extract_cmd = (
            f"ffmpeg -i {video_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        )
        subprocess.run(extract_cmd, shell=True, check=True, capture_output=True)

        print("Starting transcription with WhisperX...")
        start_time = time.time()

        audio = whisperx.load_audio(str(audio_path))
        result = self.whisperx_model.transcribe(audio, batch_size=16)

        result = whisperx.align(
            result["segments"],
            self.alignment_model,
            self.metadata,
            audio,
            device="cuda",
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

    def identify_moments(self, transcript: list) -> MomentsExtraction:
        """Extract viral clips between 30-60 seconds from transcript using Gemini Structured Outputs."""
        prompt = f"""
This is a podcast video transcript consisting of words, along with each word's start and end time. I am looking to create clips between a minimum of 30 and maximum of 60 seconds long. The clip should never exceed 60 seconds.

Your task is to find and extract stories, hooks, questions and their corresponding answers from the transcript.
Each clip should begin with an engaging hook or question and conclude with the resolution or answer.
It is acceptable for the clip to include a few additional sentences before a question if it aids in contextualizing the question.

Please adhere to the following rules:
- Ensure that clips do not overlap with one another.
- Start and end timestamps of the clips should align perfectly with the sentence boundaries in the transcript.
- Only use the start and end timestamps provided in the input. Modifying timestamps is not allowed.
- Clip duration (end - start) must be strictly greater than 0 and less than or equal to 60.0 seconds.
- Provide a viral hook, title, virality_score (1 to 10), and reason for each clip.
- If there are no valid clips to extract, return an empty clips list: {{"clips": []}}.

The transcript is as follows:
{json.dumps(transcript) if isinstance(transcript, (list, dict)) else str(transcript)}
"""
        client = getattr(self, "gemini_client", None)
        if client is None:
            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy_key"))
        response = client.models.generate_content(
            model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MomentsExtraction,
            ),
        )
        print(f"Identified moments response: {response.text}")
        if not response.text:
            return MomentsExtraction(clips=[])

        try:
            return MomentsExtraction.model_validate_json(response.text)
        except Exception:
            cleaned = response.text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[len("```json"):].strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-len("```")].strip()
            return MomentsExtraction.model_validate_json(cleaned)

    @modal.fastapi_endpoint(method="POST")
    def process_video(
        self,
        request: ProcessVideoRequest,
        token: HTTPAuthorizationCredentials = Depends(auth_scheme),
    ) -> ProcessVideoResponse:
        s3_key = request.s3_key
        preset = request.preset or "HORMOZI"

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
            # Download video file
            video_path = base_dir / "input.mp4"
            s3_client = boto3.client("s3")
            s3_client.download_file("ai-podcast-clipper", s3_key, str(video_path))

            # 1. Transcription
            transcript_segments_json = self.transcribe_video(base_dir, video_path)
            transcript_segments = json.loads(transcript_segments_json)

            # 2. Identify moments for clips using structured schema
            print("Identifying clip moments with Gemini structured output...")
            moments_extraction = self.identify_moments(transcript_segments)
            clips_to_process = moments_extraction.clips[:5]
            print(f"Identified {len(clips_to_process)} candidate clips")

            # 3. Process clips (LR-ASD on cropped segments + vertical reframe + styled subtitles)
            processed_clips = []
            for index, clip_item in enumerate(clips_to_process):
                print(
                    f"Processing clip {index} ({clip_item.title}): from "
                    f"{clip_item.start}s to {clip_item.end}s"
                )
                clip_result = process_clip(
                    base_dir=base_dir,
                    original_video_path=video_path,
                    s3_key=s3_key,
                    start_time=clip_item.start,
                    end_time=clip_item.end,
                    clip_index=index,
                    transcript_segments=transcript_segments,
                    preset=preset,
                    clip_item=clip_item,
                )
                processed_clips.append(clip_result)

            return ProcessVideoResponse(
                success=True,
                file_id=s3_key,
                clips=processed_clips,
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
