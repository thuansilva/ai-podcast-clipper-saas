"""Shared settings and helpers for tests that talk to a real MinIO server.

Used by the `minio` marked integration tests and meant to be reused by a future
e2e test, so the fixtures (endpoint, credentials, bucket, deterministic payload)
live in one place.

Expected MinIO (see docker-compose.yml, service provided by the infra setup):
  - API on http://localhost:9000 (path-style addressing, required by MinIO)
  - root user/password = the MinIO defaults below, unless overridden with the
    TEST_MINIO_* environment variables
  - bucket `ai-podcast-clipper-test` is created by the tests if it is missing,
    so it never touches the dev bucket `ai-podcast-clipper`

The helpers never fall back silently: if MinIO is unreachable, the caller gets
a reason string and the test skips with it. Authentication or permission
failures are NOT skipped, they fail, because they are real misconfigurations.
"""

import os
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectTimeoutError, EndpointConnectionError

MINIO_ENDPOINT_URL: str = os.environ.get("TEST_MINIO_ENDPOINT_URL", "http://localhost:9000")
MINIO_ACCESS_KEY: str = os.environ.get("TEST_MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY: str = os.environ.get("TEST_MINIO_SECRET_KEY", "minioadmin")
MINIO_REGION: str = "us-east-1"
MINIO_TEST_BUCKET: str = os.environ.get("TEST_MINIO_BUCKET", "ai-podcast-clipper-test")

# Fixed object key so the run is deterministic and easy to inspect in the MinIO console.
MINIO_FIXTURE_KEY: str = "tests/minio-integration/deterministic-fixture.bin"

_PAYLOAD_SIZE_BYTES: int = 4096


def deterministic_payload() -> bytes:
    """4 KiB pattern with no randomness: the same bytes on every run and machine."""
    return bytes(index % 251 for index in range(_PAYLOAD_SIZE_BYTES))


def harness_s3_client():
    """Raw boto3 client for test setup/verification (bucket creation, reading back
    the object). Production code must NOT use this: it goes through the factory."""
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT_URL,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        region_name=MINIO_REGION,
        config=Config(
            s3={"addressing_style": "path"},
            connect_timeout=2,
            read_timeout=5,
            retries={"max_attempts": 0},
        ),
    )


def probe_minio() -> Optional[str]:
    """Returns None when MinIO answers, or a human-readable reason to skip.

    Only connection-level failures produce a skip reason. Credential or
    permission errors (ClientError) are re-raised so they fail loudly.
    """
    try:
        harness_s3_client().list_buckets()
    except (EndpointConnectionError, ConnectTimeoutError) as exc:
        return f"não foi possível conectar em {MINIO_ENDPOINT_URL}: {exc}"
    return None


def ensure_test_bucket() -> None:
    """Creates MINIO_TEST_BUCKET if it does not exist yet (idempotent)."""
    client = harness_s3_client()
    try:
        client.head_bucket(Bucket=MINIO_TEST_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=MINIO_TEST_BUCKET)
