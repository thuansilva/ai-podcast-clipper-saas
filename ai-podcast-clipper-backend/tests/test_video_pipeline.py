"""Unit tests for core/video_pipeline.py::run_video_processing_pipeline.

Spec sections 6 and 7 (RN-PIPE-MANUAL-06, 08, 09, 10) and 10 (unit cases for
video_pipeline). Every external dependency is replaced by a mock: S3/download
(`resolve_input_video_path`), ffprobe (`get_video_duration_seconds`), Gemini
(`identify_moments`), WhisperX (`WhisperTranscriber`, spec'd MagicMock) and the
per-clip processing (`process_clip`).

Phase 1 (RED): the new signature `run_video_processing_pipeline(request=...)`
does not exist yet, so the manual-mode tests fail with TypeError; the
regression test also uses the new signature and is expected to fail for the
same reason until Phase 2. The fixture patches `get_video_duration_seconds`
with `raising=False` so that a missing attribute does not fail the setup of
tests that do not need it.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

from core import video_pipeline
from core.schemas import ClipItem, MomentsExtraction, ProcessVideoRequest
from core.transcription import WhisperTranscriber
from tests.manual_cuts_fixture import load_manual_cuts_payload
from tests.moments_fakes import FakeMomentsProvider
from tests.storage_fakes import FakeObjectStorage

TRANSCRIPT_SEGMENTS: List[Dict[str, Any]] = [
    {"start": 0.0, "end": 0.4, "word": "Olá"},
    {"start": 0.5, "end": 0.9, "word": "pessoal"},
    {"start": 1.0, "end": 1.6, "word": "bem-vindos"},
]


# One word per second across the whole fixture video (absolute times).
ABSOLUTE_WORDS: List[Dict[str, Any]] = [
    {"start": float(i), "end": i + 0.8, "word": f"w{i}"} for i in range(0, 60)
]


def _gemini_extraction() -> MomentsExtraction:
    return MomentsExtraction(
        clips=[
            ClipItem(
                title="Gancho do Gemini 1",
                hook="gancho 1",
                start=10.0,
                end=40.0,
                virality_score=9,
                reason="motivo 1",
            ),
            ClipItem(
                title="Gancho do Gemini 2",
                hook="gancho 2",
                start=50.0,
                end=80.0,
                virality_score=8,
                reason="motivo 2",
            ),
            ClipItem(
                title="Gancho do Gemini 3",
                hook="gancho 3",
                start=90.0,
                end=120.0,
                virality_score=7,
                reason="motivo 3",
            ),
        ]
    )


def _fake_process_clip(**kwargs: Any) -> Dict[str, Any]:
    return {
        "clip_index": kwargs["clip_index"],
        "s3_key": f"clips/test/clip_{kwargs['clip_index']}.mp4",
        "start": kwargs["start_time"],
        "end": kwargs["end_time"],
        "duration": kwargs["end_time"] - kwargs["start_time"],
        "preset": kwargs["preset"],
    }


@pytest.fixture
def transcriber() -> WhisperTranscriber:
    mock_transcriber = MagicMock(spec=WhisperTranscriber)
    mock_transcriber.transcribe.return_value = json.dumps(TRANSCRIPT_SEGMENTS)

    def _fake_transcribe_range(base_dir, video_path, start, end):
        # Behaves like the real method: absolute times, only words in [start, end].
        return json.dumps(
            [w for w in ABSOLUTE_WORDS if w["end"] > start and w["start"] < end]
        )

    mock_transcriber.transcribe_range.side_effect = _fake_transcribe_range
    return mock_transcriber


@pytest.fixture
def deps(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Dict[str, MagicMock]:
    moments_provider = MagicMock()
    moments_provider.identify_moments.return_value = _gemini_extraction()
    mocks: Dict[str, MagicMock] = {
        "resolve": MagicMock(return_value=tmp_path / "input.mp4"),
        "moments_provider": moments_provider,
        "identify": moments_provider.identify_moments,
        "process_clip": MagicMock(side_effect=_fake_process_clip),
        "duration": MagicMock(return_value=60.0),
    }
    monkeypatch.setattr(video_pipeline, "resolve_input_video_path", mocks["resolve"])
    monkeypatch.setattr(video_pipeline, "process_clip", mocks["process_clip"])
    monkeypatch.setattr(
        video_pipeline, "get_video_duration_seconds", mocks["duration"], raising=False
    )
    return mocks


def _run(
    request: ProcessVideoRequest,
    base_dir: Path,
    transcriber: WhisperTranscriber,
    clips_limit: int = 5,
    storage: Optional[FakeObjectStorage] = None,
    moments_provider=None,
):
    # Phase 1b: the pipeline receives the ObjectStorage port (D1) instead of
    # an s3_bucket string. Default to an in-memory fake, never real S3.
    return video_pipeline.run_video_processing_pipeline(
        request=request,
        base_dir=base_dir,
        transcriber=transcriber,
        moments_provider=moments_provider if moments_provider is not None else MagicMock(),
        clips_limit=clips_limit,
        storage=storage if storage is not None else FakeObjectStorage(),
        asd_dir="/asd",
    )


class TestManualMode:
    def test_does_not_call_gemini_identify_moments(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-08
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)
        deps["identify"].assert_not_called()

    def test_never_transcribes_the_whole_video(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-08: only the cut ranges are transcribed.
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)
        transcriber.transcribe.assert_not_called()
        transcriber.transcribe_range.assert_called()

    def test_overlapping_cuts_are_merged_into_a_single_range(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # Fixture cuts (0,4), (4,9.5), (8,12) overlap/touch -> one range with
        # 0.5s margin clamped to 0 at the start: (0, 12.5).
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)
        calls = transcriber.transcribe_range.call_args_list
        assert [(c.args[2], c.args[3]) for c in calls] == [(0.0, 12.5)]

    def test_distant_cuts_are_transcribed_separately_with_margin(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        deps["duration"].return_value = 60.0
        payload = load_manual_cuts_payload()
        payload["manual_cuts"] = [{"start": 40.0, "end": 50.0}, {"start": 10.0, "end": 20.0}]
        request = ProcessVideoRequest.model_validate(payload)
        _run(request, tmp_path, transcriber)
        calls = transcriber.transcribe_range.call_args_list
        assert [(c.args[2], c.args[3]) for c in calls] == [(9.5, 20.5), (39.5, 50.5)]

    def test_margin_is_clamped_to_video_duration(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        deps["duration"].return_value = 50.2
        payload = load_manual_cuts_payload()
        payload["manual_cuts"] = [{"start": 40.0, "end": 50.0}]
        request = ProcessVideoRequest.model_validate(payload)
        _run(request, tmp_path, transcriber)
        call = transcriber.transcribe_range.call_args_list[0]
        assert (call.args[2], call.args[3]) == (39.5, 50.2)

    def test_merged_transcript_has_no_duplicate_words_and_is_sorted(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        payload = load_manual_cuts_payload()
        payload["manual_cuts"] = [
            {"start": 30.0, "end": 40.0},
            {"start": 5.0, "end": 15.0},
            {"start": 12.0, "end": 20.0},
        ]
        request = ProcessVideoRequest.model_validate(payload)
        _run(request, tmp_path, transcriber)

        passed = deps["process_clip"].call_args_list[0].kwargs["transcript_segments"]
        words = [w["word"] for w in passed]
        assert len(words) == len(set(words))
        assert [w["start"] for w in passed] == sorted(w["start"] for w in passed)
        assert words[0] == "w5" or words[0] == "w4"  # 4.8 > 4.5 margin start
        assert "w25" not in words  # gap between ranges is not transcribed
        # every clip receives the same merged absolute-time transcript
        for call in deps["process_clip"].call_args_list:
            assert call.kwargs["transcript_segments"] == passed

    def test_processes_one_clip_per_manual_cut_with_exact_timestamps(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)

        assert deps["process_clip"].call_count == 3
        timestamps = [
            (call.kwargs["start_time"], call.kwargs["end_time"])
            for call in deps["process_clip"].call_args_list
        ]
        assert timestamps == [(0.0, 4.0), (4.0, 9.5), (8.0, 12.0)]
        clip_indexes = [call.kwargs["clip_index"] for call in deps["process_clip"].call_args_list]
        assert clip_indexes == [0, 1, 2]

    def test_passes_manual_cut_as_clip_item_without_virality_fields(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-10 / -11: the origin of the metadata is the manual cut itself.
        from core.schemas import ManualCut

        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)

        first_clip_item = deps["process_clip"].call_args_list[0].kwargs["clip_item"]
        assert isinstance(first_clip_item, ManualCut)
        assert first_clip_item.title == "Abertura"

    def test_ignores_clips_limit_and_processes_every_cut(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-09 (D4): clips_limit=5 of the automatic mode does not apply.
        request_dict = load_manual_cuts_payload()
        request_dict["manual_cuts"] = [
            {"start": float(index), "end": float(index) + 2.0} for index in range(7)
        ]
        request = ProcessVideoRequest.model_validate(request_dict)

        _run(request, tmp_path, transcriber, clips_limit=2)

        assert deps["process_clip"].call_count == 7

    def test_response_contains_one_clip_per_manual_cut(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        response = _run(request, tmp_path, transcriber)

        assert response.success is True
        assert response.file_id == request.s3_key
        assert [(clip["start"], clip["end"]) for clip in response.clips] == [
            (0.0, 4.0),
            (4.0, 9.5),
            (8.0, 12.0),
        ]

    def test_cut_exceeding_real_duration_is_rejected_before_transcription(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-06 + spec section 3.3: validated after probe, before WhisperX.
        from core.video_probe import ManualCutExceedsVideoDurationError

        deps["duration"].return_value = 10.0  # fixture cut ends at 12.0
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())

        with pytest.raises(ManualCutExceedsVideoDurationError):
            _run(request, tmp_path, transcriber)

        transcriber.transcribe.assert_not_called()
        deps["process_clip"].assert_not_called()
        deps["identify"].assert_not_called()

    def test_cuts_within_real_duration_are_processed(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        deps["duration"].return_value = 12.0  # boundary: last cut ends exactly at 12.0
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())
        _run(request, tmp_path, transcriber)
        assert deps["process_clip"].call_count == 3


class TestAutoModeRegression:
    def test_auto_mode_runs_gemini_and_respects_clips_limit(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # Regression guard for the automatic path: behaviour must not change.
        request = ProcessVideoRequest(s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4", mode="auto")
        _run(request, tmp_path, transcriber, clips_limit=2, moments_provider=deps["moments_provider"])

        deps["identify"].assert_called_once()
        transcriber.transcribe.assert_called_once()
        transcriber.transcribe_range.assert_not_called()
        assert deps["process_clip"].call_count == 2
        processed_titles = [
            call.kwargs["clip_item"].title for call in deps["process_clip"].call_args_list
        ]
        assert processed_titles == ["Gancho do Gemini 1", "Gancho do Gemini 2"]
        assert all(
            isinstance(call.kwargs["clip_item"], ClipItem)
            for call in deps["process_clip"].call_args_list
        )

    def test_auto_mode_never_probes_video_duration(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # Only manual mode needs the real duration (RN-PIPE-MANUAL-06).
        request = ProcessVideoRequest(s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4", mode="auto")
        _run(request, tmp_path, transcriber)
        deps["duration"].assert_not_called()

    def test_request_without_mode_field_runs_automatic_path(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # RN-PIPE-MANUAL-14: legacy caller (only s3_key/preset) keeps the automatic path.
        request = ProcessVideoRequest(s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4", preset="NEON")
        response = _run(
            request, tmp_path, transcriber, clips_limit=5, moments_provider=deps["moments_provider"]
        )

        deps["identify"].assert_called_once()
        assert len(response.clips) == 3
        assert all(clip["preset"] == "NEON" for clip in response.clips)


class TestStorageInjection:
    """D1: the pipeline forwards the injected ObjectStorage to the places that
    need it (source download and per-clip upload) instead of building its own
    boto3 client or taking an s3_bucket string."""

    def test_storage_is_forwarded_to_input_resolution(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        storage = FakeObjectStorage()
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())

        _run(request, tmp_path, transcriber, storage=storage)

        assert deps["resolve"].call_args.kwargs["storage"] is storage

    def test_storage_is_forwarded_to_every_clip(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        storage = FakeObjectStorage()
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())

        _run(request, tmp_path, transcriber, storage=storage)

        assert deps["process_clip"].call_count == 3
        for call in deps["process_clip"].call_args_list:
            assert call.kwargs["storage"] is storage

    def test_s3_bucket_is_no_longer_a_pipeline_parameter(self):
        import inspect

        parameters = inspect.signature(video_pipeline.run_video_processing_pipeline).parameters
        assert "s3_bucket" not in parameters
        assert "storage" in parameters


class TestMomentsProviderInjection:
    """The pipeline delegates viral moment identification to the injected
    `MomentsProvider` (core/moments_port.py) instead of calling Gemini's
    `identify_moments` directly — same injection pattern as `ObjectStorage`
    above, so Gemini/Claude/any future backend is a config choice
    (core/moments_factory.py), not a pipeline-level branch."""

    def test_auto_mode_calls_injected_provider_with_transcript(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        fake_provider = FakeMomentsProvider(_gemini_extraction())
        request = ProcessVideoRequest(s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4", mode="auto")

        _run(request, tmp_path, transcriber, moments_provider=fake_provider)

        assert len(fake_provider.calls) == 1
        assert fake_provider.calls[0] == TRANSCRIPT_SEGMENTS

    def test_manual_mode_never_calls_the_injected_provider(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        fake_provider = FakeMomentsProvider(_gemini_extraction())
        request = ProcessVideoRequest.model_validate(load_manual_cuts_payload())

        _run(request, tmp_path, transcriber, moments_provider=fake_provider)

        assert fake_provider.calls == []

    def test_gemini_client_is_no_longer_a_pipeline_parameter(self):
        import inspect

        parameters = inspect.signature(video_pipeline.run_video_processing_pipeline).parameters
        assert "gemini_client" not in parameters
        assert "moments_provider" in parameters


class TestGenrePropagation:
    """RF-PIPE-GENRE: `request.genre` reaches the injected `MomentsProvider`
    unchanged, so provider-level prompt steering (core/moments.py,
    core/claude_moments.py) actually receives it."""

    @pytest.mark.parametrize("genre", ["humor", "perguntas", "jogos", "outros"])
    def test_auto_mode_forwards_request_genre_to_the_provider(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path, genre: str
    ):
        fake_provider = FakeMomentsProvider(_gemini_extraction())
        request = ProcessVideoRequest(
            s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4",
            mode="auto",
            genre=genre,
        )

        _run(request, tmp_path, transcriber, moments_provider=fake_provider)

        assert fake_provider.genres == [genre]

    def test_auto_mode_forwards_none_when_genre_is_omitted(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        fake_provider = FakeMomentsProvider(_gemini_extraction())
        request = ProcessVideoRequest(
            s3_key="uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4",
            mode="auto",
        )

        _run(request, tmp_path, transcriber, moments_provider=fake_provider)

        assert fake_provider.genres == [None]

    def test_manual_mode_never_calls_the_provider_so_genre_is_irrelevant(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        fake_provider = FakeMomentsProvider(_gemini_extraction())
        payload = load_manual_cuts_payload()
        payload["genre"] = "humor"
        request = ProcessVideoRequest.model_validate(payload)

        _run(request, tmp_path, transcriber, moments_provider=fake_provider)

        assert fake_provider.genres == []


class TestExcludedRangesFiltering:
    """RF 'adicionar mais cortes': `core/video_pipeline.py` discards
    automatic-mode candidates overlapping `request.excluded_ranges` with a
    defensive, code-enforced filter (never relies solely on the LLM prompt
    obeying it), BEFORE `clips_limit` is applied. Overlap semantics mirror
    the frontend's `rangesOverlap`
    (`src/domain/services/range-overlap.service.ts`):
    `clip.start < excluded.end and excluded.start < clip.end`."""

    def _three_candidates(self) -> MomentsExtraction:
        return MomentsExtraction(
            clips=[
                ClipItem(title="A", hook="h", start=10.0, end=40.0, virality_score=9, reason="r"),
                ClipItem(title="B", hook="h", start=50.0, end=80.0, virality_score=8, reason="r"),
                ClipItem(title="C", hook="h", start=90.0, end=120.0, virality_score=7, reason="r"),
            ]
        )

    def _run_auto(
        self,
        deps: Dict[str, MagicMock],
        transcriber: WhisperTranscriber,
        tmp_path: Path,
        excluded_ranges,
        clips_limit: int = 5,
    ):
        fake_provider = FakeMomentsProvider(self._three_candidates())
        payload: Dict[str, Any] = {
            "s3_key": "uploads/user_1/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4",
            "mode": "auto",
        }
        if excluded_ranges is not None:
            payload["excluded_ranges"] = excluded_ranges
        request = ProcessVideoRequest.model_validate(payload)
        _run(request, tmp_path, transcriber, clips_limit=clips_limit, moments_provider=fake_provider)
        return [call.kwargs["clip_item"].title for call in deps["process_clip"].call_args_list]

    @pytest.mark.parametrize(
        ("excluded_start", "excluded_end", "expected_titles"),
        [
            # Overlaps A at its start (partial overlap at the beginning).
            (5.0, 15.0, ["B", "C"]),
            # Overlaps A at its end (partial overlap at the end).
            (35.0, 45.0, ["B", "C"]),
            # Fully contains B.
            (45.0, 85.0, ["A", "C"]),
            # Fully contained within C.
            (95.0, 100.0, ["A", "B"]),
            # Touches A's end exactly: edge-touching ranges never overlap.
            (40.0, 50.0, ["A", "B", "C"]),
            # No overlap with any candidate.
            (200.0, 210.0, ["A", "B", "C"]),
        ],
        ids=[
            "overlap_at_start",
            "overlap_at_end",
            "excluded_contains_candidate",
            "candidate_contains_excluded",
            "edge_touching_is_not_overlap",
            "no_overlap",
        ],
    )
    def test_overlap_variations(
        self,
        deps: Dict[str, MagicMock],
        transcriber: WhisperTranscriber,
        tmp_path: Path,
        excluded_start: float,
        excluded_end: float,
        expected_titles: List[str],
    ):
        titles = self._run_auto(
            deps, transcriber, tmp_path, [{"start": excluded_start, "end": excluded_end}]
        )
        assert titles == expected_titles

    def test_excluded_ranges_absent_does_not_filter_anything_regression(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        titles = self._run_auto(deps, transcriber, tmp_path, excluded_ranges=None)
        assert titles == ["A", "B", "C"]

    def test_empty_excluded_ranges_does_not_filter_anything_regression(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        titles = self._run_auto(deps, transcriber, tmp_path, excluded_ranges=[])
        assert titles == ["A", "B", "C"]

    def test_filter_runs_before_clips_limit_is_applied(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        # clips_limit=2. If clips_limit were applied BEFORE the filter, the
        # first 2 candidates (A, B) would be sliced first and A then
        # discarded, leaving only B. Filtering first (the required order)
        # discards A up front, leaving [B, C], then clips_limit=2 keeps both.
        titles = self._run_auto(
            deps, transcriber, tmp_path, [{"start": 5.0, "end": 15.0}], clips_limit=2
        )
        assert titles == ["B", "C"]

    def test_heavy_filtering_returns_fewer_than_clips_limit_never_more(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        titles = self._run_auto(
            deps,
            transcriber,
            tmp_path,
            [{"start": 5.0, "end": 15.0}, {"start": 85.0, "end": 95.0}],
            clips_limit=5,
        )
        assert titles == ["B"]

    def test_manual_mode_ignores_excluded_ranges_since_moments_identification_never_runs(
        self, deps: Dict[str, MagicMock], transcriber: WhisperTranscriber, tmp_path: Path
    ):
        payload = load_manual_cuts_payload()
        payload["excluded_ranges"] = [{"start": 0.0, "end": 100.0}]
        request = ProcessVideoRequest.model_validate(payload)

        _run(request, tmp_path, transcriber, moments_provider=deps["moments_provider"])

        # All 3 fixture manual cuts are still processed -- excluded_ranges
        # has no effect in manual mode.
        assert deps["process_clip"].call_count == 3
        deps["identify"].assert_not_called()


class TestResolveInputVideoPath:
    """RNF-SEC-19: core/video_pipeline.py::resolve_input_video_path always
    downloads `s3_key` through the storage port into base_dir/input.mp4. The
    old local-file shortcut (`os.path.exists(s3_key)` -> `shutil.copy`) let a
    caller read arbitrary files from the container (`s3_key="/etc/passwd"`)
    and is gone: a key that happens to match a file on disk is NOT copied."""

    def test_downloads_through_storage_when_key_is_not_a_local_file(self, tmp_path: Path):
        key = "uploads/user_test/8f14e45f-ceea-4e67-a1b2-3c4d5e6f7a8b/podcast.mp4"
        storage = FakeObjectStorage(files={key: b"remote-video-bytes"})
        base_dir = tmp_path / "run"
        base_dir.mkdir()

        resolved = video_pipeline.resolve_input_video_path(key, base_dir, storage=storage)

        assert resolved == base_dir / "input.mp4"
        assert storage.downloads == [(key, str(base_dir / "input.mp4"))]
        assert resolved.read_bytes() == b"remote-video-bytes"

    def test_existing_local_path_is_never_copied_only_storage_is_used(self, tmp_path: Path):
        source = tmp_path / "local-podcast.mp4"
        source.write_bytes(b"local-secret-bytes")
        key = str(source)
        storage = FakeObjectStorage(files={key: b"storage-bytes"})
        base_dir = tmp_path / "run"
        base_dir.mkdir()

        resolved = video_pipeline.resolve_input_video_path(key, base_dir, storage=storage)

        assert resolved == base_dir / "input.mp4"
        assert storage.downloads == [(key, str(base_dir / "input.mp4"))]
        assert resolved.read_bytes() == b"storage-bytes"

    def test_local_file_missing_from_storage_fails_instead_of_being_copied(
        self, tmp_path: Path
    ):
        source = tmp_path / "passwd"
        source.write_bytes(b"root:x:0:0")
        base_dir = tmp_path / "run"
        base_dir.mkdir()
        storage = FakeObjectStorage()

        with pytest.raises(FileNotFoundError):
            video_pipeline.resolve_input_video_path(str(source), base_dir, storage=storage)

        assert storage.downloads == [(str(source), str(base_dir / "input.mp4"))]
        assert not (base_dir / "input.mp4").exists()
