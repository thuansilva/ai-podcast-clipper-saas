"""Unit tests for core/clip_pipeline.py::process_clip with manual cuts.

Spec section 4 (response shape per origin) and section 10 (unit cases for
clip_pipeline). ffmpeg, LR-ASD, vertical reframe, subtitles and S3 are all
replaced by mocks: nothing is executed for real.

Phase 1 (RED): `schemas.ManualCut` does not exist yet, so the manual-cut tests
fail with AttributeError. The ClipItem tests are green guards that protect the
automatic path (hook/virality_score/reason populated).
"""

from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock

import boto3
import pytest

from core import clip_pipeline, schemas
from core.schemas import ClipItem


@pytest.fixture
def mocked_side_effects(monkeypatch: pytest.MonkeyPatch) -> Dict[str, MagicMock]:
    mocks: Dict[str, MagicMock] = {
        "subprocess_run": MagicMock(),
        "shutil_copy": MagicMock(),
        "asd": MagicMock(return_value=([], [])),
        "vertical": MagicMock(),
        "subtitles": MagicMock(),
        "s3_upload": MagicMock(),
    }
    s3_client = MagicMock()
    s3_client.upload_file = mocks["s3_upload"]
    monkeypatch.setattr(clip_pipeline.subprocess, "run", mocks["subprocess_run"])
    monkeypatch.setattr(clip_pipeline.shutil, "copy", mocks["shutil_copy"])
    monkeypatch.setattr(clip_pipeline, "run_active_speaker_detection", mocks["asd"])
    monkeypatch.setattr(clip_pipeline, "create_vertical_video", mocks["vertical"])
    monkeypatch.setattr(clip_pipeline, "create_subtitles_with_ffmpeg", mocks["subtitles"])
    monkeypatch.setattr(boto3, "client", MagicMock(return_value=s3_client))
    return mocks


def _process(
    base_dir: Path,
    clip_item: Any,
    clip_index: int,
    start_time: float,
    end_time: float,
) -> Dict[str, Any]:
    return clip_pipeline.process_clip(
        base_dir=base_dir,
        original_video_path=base_dir / "input.mp4",
        s3_key="uploads/user_1/abc/podcast.mp4",
        start_time=start_time,
        end_time=end_time,
        clip_index=clip_index,
        transcript_segments=[],
        preset="HORMOZI",
        clip_item=clip_item,
        s3_bucket="test-bucket",
        asd_dir="/asd",
    )


class TestManualCutMetadata:
    def test_manual_cut_title_is_used_as_clip_title(
        self, tmp_path: Path, mocked_side_effects: Dict[str, MagicMock]
    ):
        # RN-PIPE-MANUAL-10
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Pergunta difícil")
        metadata = _process(tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5)
        assert metadata["title"] == "Pergunta difícil"

    def test_manual_cut_without_title_falls_back_to_numbered_title(
        self, tmp_path: Path, mocked_side_effects: Dict[str, MagicMock]
    ):
        # RN-PIPE-MANUAL-10: "Manual clip {N}", N is 1-based. clip_index is 0-based,
        # so clip_index=2 is the third clip -> "Manual clip 3".
        cut = schemas.ManualCut(start=12.5, end=32.5)
        metadata = _process(tmp_path, cut, clip_index=2, start_time=12.5, end_time=32.5)
        assert metadata["title"] == "Manual clip 3"

    def test_manual_cut_has_no_hook_virality_score_or_reason(
        self, tmp_path: Path, mocked_side_effects: Dict[str, MagicMock]
    ):
        # RN-PIPE-MANUAL-11: these fields are only filled by the automatic (Gemini) origin.
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")
        metadata = _process(tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5)
        assert metadata.get("hook") is None
        assert metadata.get("virality_score") is None
        assert metadata.get("reason") is None

    def test_manual_cut_metadata_keeps_exact_timing_and_preset(
        self, tmp_path: Path, mocked_side_effects: Dict[str, MagicMock]
    ):
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")
        metadata = _process(tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5)
        assert metadata["start"] == 12.5
        assert metadata["end"] == 32.5
        assert metadata["duration"] == pytest.approx(20.0)
        assert metadata["preset"] == "HORMOZI"
        assert metadata["clip_index"] == 0
        assert metadata["s3_key"].startswith("clips/")


class TestAutomaticClipItemRegression:
    def test_clip_item_keeps_hook_virality_score_and_reason(
        self, tmp_path: Path, mocked_side_effects: Dict[str, MagicMock]
    ):
        # Green guard: automatic mode must keep filling the AI metadata.
        clip_item = ClipItem(
            title="Gancho",
            hook="Você não vai acreditar",
            start=10.0,
            end=40.0,
            virality_score=9,
            reason="Hook forte com insight acionável",
        )
        metadata = _process(tmp_path, clip_item, clip_index=0, start_time=10.0, end_time=40.0)
        assert metadata["title"] == "Gancho"
        assert metadata["hook"] == "Você não vai acreditar"
        assert metadata["virality_score"] == 9
        assert metadata["reason"] == "Hook forte com insight acionável"
