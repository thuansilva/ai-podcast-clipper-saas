"""Unit tests for core/clip_pipeline.py::process_clip with manual cuts.

Spec section 4 (response shape per origin) and section 10 (unit cases for
clip_pipeline). ffmpeg, LR-ASD, vertical reframe and subtitles are replaced by
mocks; the final upload goes through an injected in-memory ObjectStorage fake
(tests/storage_fakes.py), so no boto3 client and no S3 are touched.

Phase 1b (RED): `process_clip` does not accept `storage=` yet (it still takes
`s3_bucket` and creates its own boto3 client), so every test here fails with
TypeError until Fase 2. The manual-cut tests were already RED in Phase 1.
"""

from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock

import boto3
import pytest

from core import clip_pipeline, schemas
from core.schemas import ClipItem
from tests.storage_fakes import FakeObjectStorage


@pytest.fixture
def mocked_side_effects(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    mocks: Dict[str, Any] = {
        "subprocess_run": MagicMock(),
        "shutil_copy": MagicMock(),
        "asd": MagicMock(return_value=([], [])),
        "vertical": MagicMock(),
        "subtitles": MagicMock(),
        "storage": FakeObjectStorage(),
    }
    monkeypatch.setattr(clip_pipeline.subprocess, "run", mocks["subprocess_run"])
    monkeypatch.setattr(clip_pipeline.shutil, "copy", mocks["shutil_copy"])
    monkeypatch.setattr(clip_pipeline, "run_active_speaker_detection", mocks["asd"])
    monkeypatch.setattr(clip_pipeline, "create_vertical_video", mocks["vertical"])
    monkeypatch.setattr(clip_pipeline, "create_subtitles_with_ffmpeg", mocks["subtitles"])
    return mocks


def _process(
    base_dir: Path,
    clip_item: Any,
    clip_index: int,
    start_time: float,
    end_time: float,
    storage: FakeObjectStorage,
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
        storage=storage,
        asd_dir="/asd",
    )


class TestManualCutMetadata:
    def test_manual_cut_title_is_used_as_clip_title(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        # RN-PIPE-MANUAL-10
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Pergunta difícil")
        metadata = _process(
            tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5,
            storage=mocked_side_effects["storage"],
        )
        assert metadata["title"] == "Pergunta difícil"

    def test_manual_cut_without_title_falls_back_to_numbered_title(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        # RN-PIPE-MANUAL-10: "Manual clip {N}", N is 1-based. clip_index is 0-based,
        # so clip_index=2 is the third clip -> "Manual clip 3".
        cut = schemas.ManualCut(start=12.5, end=32.5)
        metadata = _process(
            tmp_path, cut, clip_index=2, start_time=12.5, end_time=32.5,
            storage=mocked_side_effects["storage"],
        )
        assert metadata["title"] == "Manual clip 3"

    def test_manual_cut_has_no_hook_virality_score_or_reason(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        # RN-PIPE-MANUAL-11: these fields are only filled by the automatic (Gemini) origin.
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")
        metadata = _process(
            tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5,
            storage=mocked_side_effects["storage"],
        )
        assert metadata.get("hook") is None
        assert metadata.get("virality_score") is None
        assert metadata.get("reason") is None

    def test_manual_cut_metadata_keeps_exact_timing_and_preset(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")
        metadata = _process(
            tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5,
            storage=mocked_side_effects["storage"],
        )
        assert metadata["start"] == 12.5
        assert metadata["end"] == 32.5
        assert metadata["duration"] == pytest.approx(20.0)
        assert metadata["preset"] == "HORMOZI"
        assert metadata["clip_index"] == 0
        assert metadata["s3_key"].startswith("clips/")


class TestAutomaticClipItemRegression:
    def test_clip_item_keeps_hook_virality_score_and_reason(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
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
        metadata = _process(
            tmp_path, clip_item, clip_index=0, start_time=10.0, end_time=40.0,
            storage=mocked_side_effects["storage"],
        )
        assert metadata["title"] == "Gancho"
        assert metadata["hook"] == "Você não vai acreditar"
        assert metadata["virality_score"] == 9
        assert metadata["reason"] == "Hook forte com insight acionável"


class TestClipUploadThroughInjectedStorage:
    """D1/D2: the final clip is uploaded via the injected ObjectStorage, under the
    clips/ prefix, and process_clip never creates its own boto3 client (that
    would be a second source of truth for the storage config)."""

    def test_final_clip_is_uploaded_to_injected_storage_under_clips_prefix(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        storage: FakeObjectStorage = mocked_side_effects["storage"]
        clip_item = ClipItem(
            title="Gancho",
            hook="gancho",
            start=10.0,
            end=40.0,
            virality_score=9,
            reason="motivo",
        )

        metadata = _process(
            tmp_path, clip_item, clip_index=0, start_time=10.0, end_time=40.0,
            storage=storage,
        )

        subtitled_clip = tmp_path / "clip_0" / "pyavi" / "video_with_subtitles.mp4"
        assert storage.uploads == [(str(subtitled_clip), "clips/user_1/abc/clip_0.mp4")]
        assert metadata["s3_key"] == "clips/user_1/abc/clip_0.mp4"

    def test_process_clip_does_not_create_its_own_boto3_client(
        self,
        tmp_path: Path,
        mocked_side_effects: Dict[str, Any],
        monkeypatch: pytest.MonkeyPatch,
    ):
        boto_client = MagicMock()
        monkeypatch.setattr(boto3, "client", boto_client)
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")

        _process(
            tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5,
            storage=mocked_side_effects["storage"],
        )

        boto_client.assert_not_called()

    def test_upload_failure_propagates_to_caller(
        self, tmp_path: Path, mocked_side_effects: Dict[str, Any]
    ):
        storage = FakeObjectStorage(upload_error=RuntimeError("storage unavailable"))
        cut = schemas.ManualCut(start=12.5, end=32.5, title="Corte")

        with pytest.raises(RuntimeError, match="storage unavailable"):
            _process(
                tmp_path, cut, clip_index=0, start_time=12.5, end_time=32.5,
                storage=storage,
            )
