"""S3 key helpers shared by the video processing pipeline.

Source videos are uploaded under two possible prefixes (see the frontend
use cases that generate them):

  - ``uploads/{userId}/{uuid}/{filename}``   (direct upload, see
    ``generate-upload-url.use-case.ts``)
  - ``youtube/{uuid}/original.mp4``          (YouTube import, see
    ``import-youtube-video.use-case.ts``)

Both prefixes are covered by an S3 lifecycle rule that expires objects
after 1 day (see ``docs/aws-s3-lifecycle-rules.md``) — the original video is
only needed for the few minutes it takes to process it. The rendered clips,
however, are the actual product delivered to the user and must persist
under the permanent ``clips/`` prefix, never under ``uploads/``/``youtube/``.
"""

_SOURCE_PREFIXES_WITH_IDENTIFIER_ONLY = ("uploads", "youtube")


def compute_clip_output_s3_key(source_s3_key: str, clip_name: str) -> str:
    """Compute the S3 key where a rendered clip must be stored.

    Always returns a key under the ``clips/`` prefix so the lifecycle rule
    that expires ``uploads/``/``youtube/`` after 1 day never deletes the
    final clip. Reuses the identifying path segments (user id / uuid) from
    the source key instead of its full directory, so clips don't inherit a
    prefix that is subject to expiration:

      - ``uploads/{userId}/{uuid}/{filename}`` -> ``clips/{userId}/{uuid}/{clip_name}.mp4``
      - ``youtube/{uuid}/original.mp4``         -> ``clips/{uuid}/{clip_name}.mp4``
      - anything else                           -> ``clips/{source_dir}/{clip_name}.mp4``
    """
    normalized_source_key = source_s3_key.strip("/")
    path_segments = [segment for segment in normalized_source_key.split("/") if segment]

    if path_segments and path_segments[0] in _SOURCE_PREFIXES_WITH_IDENTIFIER_ONLY:
        # Drop the known source prefix (uploads/youtube) and the filename,
        # keeping only the identifying segments (userId, uuid, ...).
        identifier_segments = path_segments[1:-1]
    else:
        # Unknown layout: fall back to reusing the source directory as the
        # identifier, same way the previous implementation did, but nested
        # under clips/ instead of replacing the source prefix in place.
        identifier_segments = path_segments[:-1]

    output_segments = ["clips", *identifier_segments, f"{clip_name}.mp4"]
    return "/".join(output_segments)
