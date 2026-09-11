"""Data schemas for AI Podcast Clipper backend."""

from typing import Any, List, Optional
from pydantic import BaseModel, Field, model_validator


class ProcessVideoRequest(BaseModel):
    """Request payload to initiate podcast video processing."""

    s3_key: str = Field(..., description="S3 storage key of the input video file")
    preset: str = Field(
        default="HORMOZI",
        description="Subtitle styling preset: HORMOZI, MINIMAL, or NEON",
    )


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
        if self.end <= self.start:
            raise ValueError(
                f"end timestamp ({self.end}) must be greater than start timestamp ({self.start})"
            )
        duration = self.end - self.start
        if duration > 60.0:
            raise ValueError(
                f"Clip duration ({duration:.2f}s) exceeds maximum allowed duration of 60.0 seconds"
            )
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

    url: str = Field(..., description="YouTube video URL to download")
    s3_bucket: str = Field(
        default="ai-podcast-clipper",
        description="Target S3 bucket name",
    )
    s3_key: Optional[str] = Field(
        default=None,
        description="Target S3 key. If not provided, a unique key will be generated.",
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
