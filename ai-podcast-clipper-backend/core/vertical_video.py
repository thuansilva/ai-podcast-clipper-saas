"""Vertical (9:16) video reframing driven by LR-ASD active speaker scores.

Extracted from `main.py` as part of the pipeline consolidation: this is the
single implementation used by both the Modal pipeline and the local dev
runner (see `AGENTS.md` / `docs/superpowers/plans/` for context) — no more
drift between what runs in production and what runs locally.
"""

import glob
import os
import pathlib
import subprocess

import numpy as np
from tqdm import tqdm

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import ffmpegcv
except ImportError:
    ffmpegcv = None


def create_vertical_video(
    tracks: list,
    scores: list,
    pyframes_path: pathlib.Path,
    pyavi_path: pathlib.Path,
    audio_path: pathlib.Path,
    output_path: pathlib.Path,
    framerate: int = 25,
) -> None:
    """Render a 1080x1920 vertical video, cropping to the active speaker.

    For each frame, picks the face with the highest smoothed LR-ASD score
    (averaged over a +/-30 frame window) and crops around it; falls back to
    a blurred-background letterbox resize when no face is actively
    speaking.
    """
    target_width = 1080
    target_height = 1920

    flist = glob.glob(os.path.join(pyframes_path, "*.jpg"))
    flist.sort()

    faces: list[list[dict]] = [[] for _ in range(len(flist))]

    for tidx, track in enumerate(tracks):
        score_array = scores[tidx]
        for fidx, frame in enumerate(track["track"]["frame"].tolist()):
            slice_start = max(fidx - 30, 0)
            slice_end = min(fidx + 30, len(score_array))
            score_slice = score_array[slice_start:slice_end]
            avg_score = float(np.mean(score_slice) if len(score_slice) > 0 else 0)

            faces[frame].append({
                "track": tidx,
                "score": avg_score,
                "s": track["proc_track"]["s"][fidx],
                "x": track["proc_track"]["x"][fidx],
                "y": track["proc_track"]["y"][fidx],
            })

    temp_video_path = os.path.join(pyavi_path, "video_only.mp4")

    vout = None
    for fidx, fname in tqdm(enumerate(flist), total=len(flist), desc="Creating vertical video"):
        img = cv2.imread(fname)
        if img is None:
            continue

        current_faces = faces[fidx]

        max_score_face = (
            max(current_faces, key=lambda face: face["score"]) if current_faces else None
        )

        if max_score_face and max_score_face["score"] < 0:
            max_score_face = None

        if vout is None:
            vout = ffmpegcv.VideoWriterNV(
                file=temp_video_path,
                codec=None,
                fps=framerate,
                resize=(target_width, target_height),
            )

        mode = "crop" if max_score_face else "resize"

        if mode == "resize":
            scale = target_width / img.shape[1]
            resized_height = int(img.shape[0] * scale)
            resized_image = cv2.resize(
                img, (target_width, resized_height), interpolation=cv2.INTER_AREA
            )

            scale_for_bg = max(target_width / img.shape[1], target_height / img.shape[0])
            bg_width = int(img.shape[1] * scale_for_bg)
            bg_heigth = int(img.shape[0] * scale_for_bg)

            blurred_background = cv2.resize(img, (bg_width, bg_heigth))
            blurred_background = cv2.GaussianBlur(blurred_background, (121, 121), 0)

            crop_x = (bg_width - target_width) // 2
            crop_y = (bg_heigth - target_height) // 2
            blurred_background = blurred_background[
                crop_y:crop_y + target_height, crop_x:crop_x + target_width
            ]

            center_y = (target_height - resized_height) // 2
            blurred_background[center_y:center_y + resized_height, :] = resized_image

            vout.write(blurred_background)

        elif mode == "crop":
            scale = target_height / img.shape[0]
            resized_image = cv2.resize(
                img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA
            )
            frame_width = resized_image.shape[1]

            center_x = int(
                max_score_face["x"] * scale if max_score_face else frame_width // 2
            )
            top_x = max(min(center_x - target_width // 2, frame_width - target_width), 0)

            image_cropped = resized_image[0:target_height, top_x:top_x + target_width]

            vout.write(image_cropped)

    if vout:
        vout.release()

    ffmpeg_command = (
        f"ffmpeg -y -i {temp_video_path} -i {audio_path} "
        f"-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128k "
        f"{output_path}"
    )
    subprocess.run(ffmpeg_command, shell=True, check=True, text=True)
