"""Unit tests for S3 key computation of rendered clip outputs.

Regression guard for the BLOCKER documented in
`docs/checklist-go-live.md` (Infraestrutura > "Regra de lifecycle do S3
quebra clipes em 24h"): the final rendered clip must be stored under the
`clips/` prefix (permanent, per `docs/aws-s3-lifecycle-rules.md`), never
under the same prefix as the original source video (`uploads/`/`youtube/`,
which expire in 1 day).
"""

from core.s3_paths import compute_clip_output_s3_key


class TestComputeClipOutputS3Key:
    def test_output_key_always_starts_with_clips_prefix(self):
        output_key = compute_clip_output_s3_key(
            source_s3_key="uploads/user_123/8f14e45f/podcast.mp4",
            clip_name="clip_0",
        )
        assert output_key.startswith("clips/")

    def test_output_key_does_not_reuse_source_directory(self):
        # Regression: the old implementation did
        # f"{os.path.dirname(s3_key)}/{clip_name}.mp4", which put the clip
        # in the SAME prefix as the original video (uploads/ or youtube/),
        # causing the lifecycle rule to delete it after 1 day.
        source_s3_key = "uploads/user_123/8f14e45f/podcast.mp4"
        output_key = compute_clip_output_s3_key(source_s3_key, clip_name="clip_0")

        source_dir = "uploads/user_123/8f14e45f"
        assert not output_key.startswith(source_dir)
        assert output_key == "clips/user_123/8f14e45f/clip_0.mp4"

    def test_uploads_prefix_reuses_user_id_and_uuid(self):
        output_key = compute_clip_output_s3_key(
            source_s3_key="uploads/user_abc/uuid-1234/original_filename.mp4",
            clip_name="clip_2",
        )
        assert output_key == "clips/user_abc/uuid-1234/clip_2.mp4"

    def test_youtube_prefix_reuses_uuid_only(self):
        output_key = compute_clip_output_s3_key(
            source_s3_key="youtube/uuid-5678/original.mp4",
            clip_name="clip_0",
        )
        assert output_key == "clips/uuid-5678/clip_0.mp4"

    def test_unknown_prefix_falls_back_to_source_directory_under_clips(self):
        output_key = compute_clip_output_s3_key(
            source_s3_key="test2/mi630min.mp4",
            clip_name="clip_0",
        )
        assert output_key == "clips/test2/clip_0.mp4"

    def test_key_without_directory_falls_back_to_bare_clips_prefix(self):
        output_key = compute_clip_output_s3_key(
            source_s3_key="podcast.mp4",
            clip_name="clip_0",
        )
        assert output_key == "clips/clip_0.mp4"
