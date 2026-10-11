"""Regression guard for the scenedetect API that `asd/Columbia_test.py` uses.

`Columbia_test.py::scene_detect` (vendored LR-ASD, not ours to edit) relies on
`scenedetect.video_manager.VideoManager` + `ContentDetector`. Two versions
broke it, each surfacing only as the misleading
`FileNotFoundError("Tracks or scores not found for clip")`:
- 0.5.x with OpenCV >= 4.x (`cv2.split` returns a tuple, and
  `ContentDetector` does item assignment on it -> TypeError);
- 0.7.x, which removed `scenedetect.video_manager` (ImportError).
`requirements.txt` pins a version that works with both.
"""

import subprocess

import pytest

pytest.importorskip("cv2")
pytest.importorskip("scenedetect")


@pytest.fixture
def two_scene_video(tmp_path):
    video_path = tmp_path / "two-scenes.mp4"
    subprocess.run(
        [
            "ffmpeg", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=25",
            "-f", "lavfi", "-i", "color=c=red:duration=3:size=160x120:rate=25",
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]",
            "-map", "[v]",
            str(video_path),
        ],
        check=True,
        capture_output=True,
    )
    return video_path


def test_columbia_scene_detect_api_finds_scene_cut(two_scene_video):
    from scenedetect.detectors import ContentDetector
    from scenedetect.scene_manager import SceneManager
    from scenedetect.stats_manager import StatsManager
    from scenedetect.video_manager import VideoManager

    video_manager = VideoManager([str(two_scene_video)])
    scene_manager = SceneManager(StatsManager())
    scene_manager.add_detector(ContentDetector())
    base_timecode = video_manager.get_base_timecode()
    video_manager.set_downscale_factor()
    video_manager.start()

    scene_manager.detect_scenes(frame_source=video_manager)
    scenes = scene_manager.get_scene_list(base_timecode)

    assert len(scenes) == 2
    assert scenes[1][0].get_seconds() == pytest.approx(3.0, abs=0.1)
