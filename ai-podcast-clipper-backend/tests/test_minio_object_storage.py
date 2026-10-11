"""Integration tests: S3ObjectStorage built by the factory against a real MinIO.

Marked `minio` (pytest.ini). Run only these with `pytest -m minio`; skip them
with `pytest -m "not minio"`. If MinIO is not reachable the tests skip with a
clear reason (tests/minio_support.py::probe_minio), they do not error.

What this proves that the unit tests cannot:
  - the factory's S3_ENDPOINT_URL + path-style config actually talks to an
    S3-compatible server (virtual-hosted style does not work on localhost, so a
    passing round trip means the addressing is right);
  - upload_file/download_file move the exact bytes into the configured bucket.

Phase 1b (RED): the factory does not exist yet. The import happens inside the
fixture, before the MinIO probe, so the failure is visible (ModuleNotFoundError)
even when MinIO is down. Once Fase 2 lands and MinIO is down, these tests skip.

Structure for a future e2e: the fixtures in this file (`minio_storage`,
`minio_fixture_object`) and the helpers in tests/minio_support.py are the
setup a Playwright/API-level e2e can reuse: fixed bucket, fixed key, fixed bytes.
"""

from pathlib import Path
from typing import Any, Dict, Iterator

import boto3
import pytest
from botocore.exceptions import ClientError

from tests.minio_support import (
    MINIO_ACCESS_KEY,
    MINIO_ENDPOINT_URL,
    MINIO_FIXTURE_KEY,
    MINIO_SECRET_KEY,
    MINIO_TEST_BUCKET,
    deterministic_payload,
    ensure_test_bucket,
    harness_s3_client,
    probe_minio,
)

pytestmark = pytest.mark.minio


@pytest.fixture
def minio_storage(monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    """ObjectStorage built by the shared factory, pointed at the local MinIO."""
    # Import first so the RED failure is ModuleNotFoundError even when MinIO is down.
    from core.storage.factory import create_object_storage

    reason = probe_minio()
    if reason is not None:
        pytest.skip(
            f"MinIO indisponível para teste de integração ({reason}). "
            "Suba o serviço MinIO do docker-compose.yml ou ajuste TEST_MINIO_ENDPOINT_URL."
        )

    # boto3 reads credentials from the standard AWS_* variables. The factory only
    # takes endpoint/bucket/provider/region from its mapping, so credentials go
    # here. AWS_REGION is set on the real environment too (belt-and-suspenders:
    # some boto3 code paths still probe os.environ directly), but the region
    # that actually reaches boto3.client(region_name=...) comes from the `env`
    # dict below, since the factory is called with that explicit mapping, not
    # os.environ.
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", MINIO_ACCESS_KEY)
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", MINIO_SECRET_KEY)
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    # boto3's process-wide default session caches credentials on first use. Another
    # test in the same pytest process may have resolved them already (with no
    # explicit credentials), so the setenv above would be ignored. Reset the default
    # session so the factory's boto3.client("s3") resolves credentials from the
    # environment configured here. monkeypatch restores the original session at
    # teardown, so later tests see the same state they saw before this fixture.
    monkeypatch.setattr(boto3, "DEFAULT_SESSION", None)

    ensure_test_bucket()
    env: Dict[str, str] = {
        "STORAGE_PROVIDER": "minio",
        "S3_ENDPOINT_URL": MINIO_ENDPOINT_URL,
        "S3_BUCKET_NAME": MINIO_TEST_BUCKET,
        "AWS_REGION": "us-east-1",
    }
    yield create_object_storage(env)


@pytest.fixture
def minio_fixture_object(minio_storage: Any) -> Iterator[bytes]:
    """Makes sure the fixture key is absent before the test and removed after it.

    Depends on `minio_storage` so the MinIO probe (and skip) always runs before
    any raw client call here.
    """
    client = harness_s3_client()
    client.delete_object(Bucket=MINIO_TEST_BUCKET, Key=MINIO_FIXTURE_KEY)
    yield deterministic_payload()
    client.delete_object(Bucket=MINIO_TEST_BUCKET, Key=MINIO_FIXTURE_KEY)


class TestMinioRoundTrip:
    def test_upload_then_download_preserves_exact_bytes(
        self,
        minio_storage: Any,
        minio_fixture_object: bytes,
        tmp_path: Path,
    ):
        src = tmp_path / "source.bin"
        src.write_bytes(minio_fixture_object)
        dest = tmp_path / "downloaded.bin"

        minio_storage.upload_file(str(src), MINIO_FIXTURE_KEY)
        minio_storage.download_file(MINIO_FIXTURE_KEY, str(dest))

        assert dest.read_bytes() == minio_fixture_object

    def test_upload_lands_in_configured_bucket_under_given_key(
        self,
        minio_storage: Any,
        minio_fixture_object: bytes,
        tmp_path: Path,
    ):
        # Read back with the raw client, bypassing the adapter: proves the object is
        # in MINIO_TEST_BUCKET under MINIO_FIXTURE_KEY, not just retrievable through
        # the same code path.
        src = tmp_path / "source.bin"
        src.write_bytes(minio_fixture_object)

        minio_storage.upload_file(str(src), MINIO_FIXTURE_KEY)

        stored = harness_s3_client().get_object(
            Bucket=MINIO_TEST_BUCKET, Key=MINIO_FIXTURE_KEY
        )["Body"].read()
        assert stored == minio_fixture_object

    def test_download_of_missing_key_raises_client_error(
        self, minio_storage: Any, tmp_path: Path
    ):
        with pytest.raises(ClientError):
            minio_storage.download_file(
                "tests/minio-integration/does-not-exist.bin",
                str(tmp_path / "never.bin"),
            )
