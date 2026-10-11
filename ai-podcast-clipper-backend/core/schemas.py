"""Data schemas for AI Podcast Clipper backend."""

from typing import Any, List, Literal, Optional, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Allowlist of subtitle presets accepted on the wire (security: `preset` used to
# flow unsanitized into a file name and a shell=True ffmpeg command — RCE).
# = every preset the UI offers (PROJECT_SUBTITLE_PRESETS in the frontend,
# src/domain/schemas/projects-actions.schema.ts, incl. "NONE", which is also the
# fallback in process-video-payload.service.ts) + "CLEAN", a legacy alias that
# core/subtitle_styles.py still understands (mapped to MINIMAL).
SubtitlePreset = Literal[
    "HORMOZI",
    "POPPING_GREEN",
    "GAMER",
    "LOUD",
    "NEON",
    "TRUE_CRIME",
    "MINIMAL",
    "CORPORATE",
    "VLOG",
    "ASMR",
    "NONE",
    "CLEAN",
]
SUBTITLE_PRESETS: tuple[str, ...] = get_args(SubtitlePreset)

# Same ceiling as the Zod schema on the frontend
# (ai-podcast-clipper-frontend/src/domain/schemas/manual-cut.schema.ts),
# validated redundantly on the backend (same defense-in-depth pattern as
# RF-INGEST-02's YouTube host validation).
MAX_MANUAL_CUTS = 50

# Same ceiling as `title: z.string().trim().min(1).max(200)` in the frontend
# Zod schema (manual-cut.schema.ts). Zod counts UTF-16 code units and Python
# counts code points, so anything the frontend accepts also passes here.
MAX_MANUAL_CUT_TITLE_LENGTH = 200


def _validate_clip_duration(start: float, end: float, max_seconds: float, label: str) -> None:
    """Shared duration/boundary rule used by both `ClipItem` (automatic mode)
    and `ManualCut` (manual mode): `end` must be greater than `start`, and the
    resulting clip must not exceed `max_seconds`."""
    if end <= start:
        raise ValueError(
            f"{label}: end timestamp ({end}) must be greater than start timestamp ({start})"
        )
    duration = end - start
    if duration > max_seconds:
        raise ValueError(
            f"{label}: duration ({duration:.2f}s) exceeds maximum allowed duration of {max_seconds} seconds"
        )


class ManualCut(BaseModel):
    """A single user-defined cut timestamp range for manual mode processing.

    Mirrors `ManualCutDTO` on the frontend
    (`src/application/dtos/video-dtos.ts`) in the wire format sent by
    `functions.ts` (`{title, start, end}`).
    """

    # allow_inf_nan=False: Python's json (used by FastAPI) accepts the
    # non-standard NaN/Infinity literals, and `end=NaN` would otherwise pass
    # every comparison-based check here and in core/video_probe.py (any
    # comparison with NaN is False), reaching the GPU pipeline.
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    start: float = Field(..., ge=0, description="Start timestamp of the manual cut, in seconds")
    end: float = Field(..., description="End timestamp of the manual cut, in seconds")
    title: Optional[str] = Field(
        default=None,
        max_length=MAX_MANUAL_CUT_TITLE_LENGTH,
        description=(
            "Optional title for the resulting clip. When omitted, the pipeline "
            'falls back to a generated title ("Manual clip {N}").'
        ),
    )

    @model_validator(mode="after")
    def validate_duration(self) -> "ManualCut":
        _validate_clip_duration(self.start, self.end, max_seconds=60.0, label="Manual cut")
        return self


# Canonical UUID (8-4-4-4-12), as produced by `uuidv4()` in the frontend and
# `uuid.uuid4()` in the backend.
_UUID_PATTERN = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

# RNF-SEC-18: the only object key the frontend ever generates for a YouTube
# import (import-youtube-video.use-case.ts: `youtube/${uuidv4()}/original.mp4`),
# and the same shape the backend generates when the key is omitted. Anything
# else (`clips/<other user>/...`, `../`, absolute/local paths) would let a
# caller holding AUTH_TOKEN overwrite arbitrary objects in the bucket.
# Pydantic v2's default (Rust) regex engine anchors `$` at the true end of the
# string, so a trailing newline doesn't sneak through.
_YOUTUBE_S3_KEY_BODY = r"youtube/" + _UUID_PATTERN + r"/original\.mp4"
YOUTUBE_S3_KEY_PATTERN = r"^" + _YOUTUBE_S3_KEY_BODY + r"$"

# RNF-SEC-19: direct-upload key, generate-upload-url.use-case.ts:
# `uploads/${userId}/${uuidv4()}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`.
# userId is a Clerk id (`user_2abc...`). The file name may contain dots, but a
# name segment that is exactly `.` or `..` is rejected (defense in depth). The
# Rust regex engine has no lookahead, so "any [A-Za-z0-9._-]+ except `.`/`..`"
# is spelled out as: starts with a non-dot, or `.` + non-dot, or `..` + 1+ chars.
_UPLOAD_FILENAME_PATTERN = (
    r"(?:[A-Za-z0-9_-][A-Za-z0-9._-]*"
    r"|\.[A-Za-z0-9_-][A-Za-z0-9._-]*"
    r"|\.\.[A-Za-z0-9._-]+)"
)
_UPLOAD_S3_KEY_BODY = (
    r"uploads/[A-Za-z0-9_-]+/" + _UUID_PATTERN + r"/" + _UPLOAD_FILENAME_PATTERN
)

# RNF-SEC-19: `ProcessVideoRequest.s3_key` must be one of the two formats the
# system generates. Anything else (absolute/local paths such as `/etc/passwd`,
# `../`, `clips/...`, trailing `\n`) is a 422 before any download — the input
# video always comes from storage, never from the container's filesystem.
PROCESS_VIDEO_S3_KEY_PATTERN = (
    r"^(?:" + _YOUTUBE_S3_KEY_BODY + r"|" + _UPLOAD_S3_KEY_BODY + r")$"
)


class ProcessVideoRequest(BaseModel):
    """Request payload to initiate podcast video processing."""

    model_config = ConfigDict(extra="forbid")  # D2: unknown field -> 422, never silently dropped

    s3_key: str = Field(
        ...,
        pattern=PROCESS_VIDEO_S3_KEY_PATTERN,
        description=(
            "Storage key of the input video. Strictly `youtube/<uuid>/original.mp4` "
            "or `uploads/<userId>/<uuid>/<name>` (RNF-SEC-19; anything else, incl. "
            "local paths, -> 422)."
        ),
    )
    preset: SubtitlePreset = Field(
        default="HORMOZI",
        description=(
            "Subtitle styling preset. Strict allowlist (SUBTITLE_PRESETS); any "
            "other value -> 422."
        ),
    )
    mode: Literal["auto", "manual"] = Field(
        default="auto",
        description=(
            "Processing mode. 'auto' (default) runs Gemini moment "
            "identification over the full transcript. 'manual' skips Gemini "
            "and processes exactly the timestamps given in manual_cuts. "
            "Orthogonal to any clip *layout* option (e.g. face-focus vs. "
            "smart-crop) — never conflate the two."
        ),
    )
    manual_cuts: Optional[List[ManualCut]] = Field(
        default=None,
        max_length=MAX_MANUAL_CUTS,
        description="Required and non-empty when mode='manual'; must be omitted/empty when mode='auto'.",
    )
    aspect_ratio: Optional[str] = Field(
        default=None,
        description=(
            "Accepted for forward-compatibility only. NOT YET implemented — "
            "has no functional effect on this pipeline version (known gap, "
            "tracked as a future RF; core/vertical_video.py only knows how to "
            "produce 9:16 today)."
        ),
    )
    auto_zoom: Optional[bool] = Field(
        default=None,
        description="Accepted for forward-compatibility only. NOT YET implemented — has no functional effect.",
    )
    genre: Optional[str] = Field(
        default=None,
        description="Accepted for forward-compatibility only. NOT YET implemented — has no functional effect.",
    )

    @model_validator(mode="after")
    def validate_mode_and_manual_cuts(self) -> "ProcessVideoRequest":
        if self.mode == "manual" and not self.manual_cuts:
            raise ValueError("mode='manual' requires a non-empty manual_cuts list")
        if self.mode == "auto" and self.manual_cuts:
            raise ValueError("manual_cuts must not be sent when mode='auto'")
        return self


class ClipItem(BaseModel):
    """Represents an identified viral clip segment within the podcast."""

    title: str = Field(..., description="Catchy title for the viral clip")
    hook: str = Field(
        ..., description="The opening hook or punchline in the first 3-5 seconds"
    )
    start: float = Field(..., description="Start timestamp of the clip in seconds")
    end: float = Field(..., description="End timestamp of the clip in seconds")
    virality_score: int = Field(
        ...,
        ge=1,
        le=10,
        description="Estimated virality score on a scale from 1 to 10",
    )
    reason: str = Field(
        ..., description="Explanation of why this clip has high virality potential"
    )

    @model_validator(mode="after")
    def validate_duration_and_boundaries(self) -> "ClipItem":
        """Validate that end > start and total clip duration does not exceed 60 seconds."""
        _validate_clip_duration(self.start, self.end, max_seconds=60.0, label="Clip")
        return self


class MomentsExtraction(BaseModel):
    """Structured response for moments extraction containing candidate clips."""

    clips: List[ClipItem] = Field(
        default_factory=list,
        description="List of extracted candidate viral clips",
    )


class ProcessVideoResponse(BaseModel):
    """Response returned after processing video into vertical clips."""

    success: bool = Field(
        default=True, description="Indicates if processing completed successfully"
    )
    file_id: str = Field(..., description="Identifier or S3 key of the source file")
    clips: List[dict[str, Any]] = Field(
        default_factory=list,
        description="List of processed clips with metadata and S3 output keys",
    )


class DownloadYouTubeRequest(BaseModel):
    """Request payload to download a YouTube video and upload it to S3."""

    # Unknown field (e.g. the legacy `s3_bucket`) -> 422, never silently dropped.
    model_config = ConfigDict(extra="forbid")

    url: str = Field(..., description="YouTube video URL to download")
    s3_key: Optional[str] = Field(
        default=None,
        pattern=YOUTUBE_S3_KEY_PATTERN,
        description=(
            "Target object key, strictly `youtube/<uuid>/original.mp4` "
            "(RNF-SEC-18; anything else -> 422). If omitted, the server "
            "generates one in the same format."
        ),
    )


class DownloadYouTubeResponse(BaseModel):
    """Response payload returned after downloading a YouTube video to S3."""

    success: bool = Field(
        default=True,
        description="Indicates whether the download and upload succeeded",
    )
    s3_key: str = Field(..., description="S3 storage key of the downloaded video")
    title: str = Field(..., description="Title of the downloaded video")
    duration: int = Field(..., description="Duration of the video in seconds")
    thumbnail: Optional[str] = Field(
        default=None,
        description="Thumbnail URL of the video",
    )
