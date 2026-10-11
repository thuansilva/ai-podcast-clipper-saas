"""Unit tests for core/storage/factory.py::create_object_storage (Fase 1b, RED).

Decision D1: one factory reads STORAGE_PROVIDER / S3_ENDPOINT_URL / S3_BUCKET_NAME
and returns the ObjectStorage used by both the Modal and the local runner.

Contract under test (STORAGE_PROVIDER has exactly 2 valid values, both backed by
the same S3ObjectStorage class, selected explicitly instead of inferred):
  - STORAGE_PROVIDER defaults to "s3".
  - "s3" -> real AWS S3. S3_ENDPOINT_URL must NOT be set (ValueError if it is).
    With no S3_ENDPOINT_URL, the boto3 client is built exactly as today:
    boto3.client("s3"). Real AWS must not change.
  - "minio" -> self-hosted S3-compatible server (local MinIO via Docker, or a
    real MinIO deployment). S3_ENDPOINT_URL is required (ValueError if missing
    or empty). When set, the client gets endpoint_url and path-style
    addressing.
  - Any other value (including the removed "local") -> ValueError, never a
    silent fallback.
  - The bucket always comes from S3_BUCKET_NAME (default "ai-podcast-clipper",
    the same default main.py / local_server.py already use).

Phase 1 (RED): core/storage/ does not exist yet, so every test fails with
ModuleNotFoundError. The imports are done inside the tests on purpose: with a
top-level import, pytest would abort the collection of the whole suite instead
of failing only these tests.
"""

import re
from typing import Dict
from unittest.mock import MagicMock

import boto3
import pytest
from botocore.config import Config

AWS_DEFAULT_BUCKET = "ai-podcast-clipper"
TEST_BUCKET = "ai-podcast-clipper-test"
MINIO_ENDPOINT = "http://localhost:9000"


def _create_object_storage(env: Dict[str, str]):
    from core.storage.factory import create_object_storage

    return create_object_storage(env)


def _env(**extra: str) -> Dict[str, str]:
    base = {"S3_BUCKET_NAME": TEST_BUCKET}
    base.update(extra)
    return base


@pytest.fixture
def boto3_client_factory(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replaces boto3.client so no real client (or network) is ever created.

    Returns the mock of `boto3.client`; the S3 client itself is `.return_value`.
    """
    factory: MagicMock = MagicMock(name="boto3.client", return_value=MagicMock(name="s3"))
    monkeypatch.setattr(boto3, "client", factory)
    return factory


class TestProviderSelection:
    def test_missing_provider_defaults_to_s3(self, boto3_client_factory: MagicMock):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(_env())

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once_with("s3")

    def test_empty_environment_defaults_to_s3_with_default_bucket(
        self, boto3_client_factory: MagicMock
    ):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage({})

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once_with("s3")
        storage.upload_file("/tmp/clip.mp4", "clips/u/x/clip_0.mp4")
        boto3_client_factory.return_value.upload_file.assert_called_once_with(
            "/tmp/clip.mp4", AWS_DEFAULT_BUCKET, "clips/u/x/clip_0.mp4"
        )

    def test_minio_provider_with_endpoint_returns_s3_object_storage(
        self, boto3_client_factory: MagicMock
    ):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(
            _env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=MINIO_ENDPOINT)
        )

        assert isinstance(storage, S3ObjectStorage)

    @pytest.mark.parametrize("bad_provider", ["blah", "gcs", "local"])
    def test_unknown_provider_raises_clear_value_error(
        self, boto3_client_factory: MagicMock, bad_provider: str
    ):
        # "local" is intentionally invalid: the local-filesystem adapter was
        # removed entirely (design decision 2026-10-10) in favor of an explicit
        # "minio" provider for self-hosted S3-compatible storage.
        with pytest.raises(ValueError, match=re.escape("STORAGE_PROVIDER")) as exc_info:
            _create_object_storage(_env(STORAGE_PROVIDER=bad_provider))

        assert bad_provider in str(exc_info.value)
        boto3_client_factory.assert_not_called()

    def test_minio_without_endpoint_raises_clear_value_error(
        self, boto3_client_factory: MagicMock
    ):
        with pytest.raises(ValueError, match=re.escape("S3_ENDPOINT_URL")):
            _create_object_storage(_env(STORAGE_PROVIDER="minio"))

        boto3_client_factory.assert_not_called()

    def test_minio_with_empty_endpoint_raises_clear_value_error(
        self, boto3_client_factory: MagicMock
    ):
        with pytest.raises(ValueError, match=re.escape("S3_ENDPOINT_URL")):
            _create_object_storage(_env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=""))

        boto3_client_factory.assert_not_called()

    def test_s3_with_endpoint_raises_clear_value_error(
        self, boto3_client_factory: MagicMock
    ):
        # "s3" + S3_ENDPOINT_URL used to secretly mean MinIO. Now that "minio" is
        # its own explicit provider, mixing the two is a configuration mistake.
        with pytest.raises(ValueError, match=re.escape("S3_ENDPOINT_URL")):
            _create_object_storage(
                _env(STORAGE_PROVIDER="s3", S3_ENDPOINT_URL=MINIO_ENDPOINT)
            )

        boto3_client_factory.assert_not_called()

    def test_no_arguments_reads_process_environment(
        self, monkeypatch: pytest.MonkeyPatch, boto3_client_factory: MagicMock
    ):
        from core.storage.factory import create_object_storage
        from core.storage.s3_object_storage import S3ObjectStorage

        monkeypatch.setenv("STORAGE_PROVIDER", "minio")
        monkeypatch.setenv("S3_ENDPOINT_URL", MINIO_ENDPOINT)

        assert isinstance(create_object_storage(), S3ObjectStorage)
        boto3_client_factory.assert_called_once()
        _, kwargs = boto3_client_factory.call_args
        assert kwargs.get("endpoint_url") == MINIO_ENDPOINT


class TestAwsRealRegression:
    """Byte-for-byte guard: "s3" with no S3_ENDPOINT_URL keeps today's call."""

    @pytest.mark.parametrize(
        "extra_env",
        [{}, {"S3_ENDPOINT_URL": ""}],
        ids=["endpoint-unset", "endpoint-empty"],
    )
    def test_client_is_created_exactly_as_before_without_endpoint(
        self, boto3_client_factory: MagicMock, extra_env: Dict[str, str]
    ):
        _create_object_storage(_env(STORAGE_PROVIDER="s3", **extra_env))

        # Exactly boto3.client("s3"): no endpoint_url, no custom config.
        boto3_client_factory.assert_called_once_with("s3")

    def test_downloads_and_uploads_go_to_configured_bucket(
        self, boto3_client_factory: MagicMock
    ):
        storage = _create_object_storage(_env(STORAGE_PROVIDER="s3"))
        s3_client = boto3_client_factory.return_value

        storage.download_file("uploads/u/x/podcast.mp4", "/tmp/work/input.mp4")
        storage.upload_file("/tmp/work/clip.mp4", "clips/u/x/clip_0.mp4")

        s3_client.download_file.assert_called_once_with(
            TEST_BUCKET, "uploads/u/x/podcast.mp4", "/tmp/work/input.mp4"
        )
        s3_client.upload_file.assert_called_once_with(
            "/tmp/work/clip.mp4", TEST_BUCKET, "clips/u/x/clip_0.mp4"
        )


class TestAwsRegion:
    """AWS_REGION (not AWS_DEFAULT_REGION): boto3 does not read AWS_REGION on its
    own (confirmed by direct test — only AWS_DEFAULT_REGION is understood by its
    automatic env detection), so the factory must read it explicitly from `env`
    and pass it as `region_name=` to boto3.client. Single env var name shared
    with the frontend (which already uses AWS_REGION)."""

    def test_aws_region_is_passed_as_region_name_without_endpoint(
        self, boto3_client_factory: MagicMock
    ):
        _create_object_storage(_env(STORAGE_PROVIDER="s3", AWS_REGION="eu-west-1"))

        boto3_client_factory.assert_called_once_with("s3", region_name="eu-west-1")

    def test_aws_region_is_passed_as_region_name_with_endpoint(
        self, boto3_client_factory: MagicMock
    ):
        _create_object_storage(
            _env(
                STORAGE_PROVIDER="minio",
                S3_ENDPOINT_URL=MINIO_ENDPOINT,
                AWS_REGION="eu-west-1",
            )
        )

        boto3_client_factory.assert_called_once()
        _, kwargs = boto3_client_factory.call_args
        assert kwargs.get("region_name") == "eu-west-1"

    def test_missing_aws_region_omits_region_name_kwarg(
        self, boto3_client_factory: MagicMock
    ):
        _create_object_storage(_env(STORAGE_PROVIDER="s3"))

        boto3_client_factory.assert_called_once_with("s3")

    def test_empty_aws_region_omits_region_name_kwarg(
        self, boto3_client_factory: MagicMock
    ):
        _create_object_storage(_env(STORAGE_PROVIDER="s3", AWS_REGION=""))

        boto3_client_factory.assert_called_once_with("s3")


class TestCustomEndpointMinIO:
    def test_endpoint_url_is_passed_to_client(self, boto3_client_factory: MagicMock):
        _create_object_storage(
            _env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=MINIO_ENDPOINT)
        )

        boto3_client_factory.assert_called_once()
        args, kwargs = boto3_client_factory.call_args
        assert args == ("s3",)
        assert kwargs.get("endpoint_url") == MINIO_ENDPOINT

    def test_path_style_addressing_is_derived_when_endpoint_is_set(
        self, boto3_client_factory: MagicMock
    ):
        # MinIO needs path-style (http://host:9000/bucket/key). Derived from the
        # "minio" provider, no extra env var.
        _create_object_storage(
            _env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=MINIO_ENDPOINT)
        )

        config = boto3_client_factory.call_args.kwargs.get("config")
        assert isinstance(config, Config)
        assert config.s3 is not None
        assert config.s3.get("addressing_style") == "path"

    def test_uploads_go_to_configured_bucket_on_custom_endpoint(
        self, boto3_client_factory: MagicMock
    ):
        storage = _create_object_storage(
            _env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=MINIO_ENDPOINT)
        )

        storage.upload_file("/tmp/work/clip.mp4", "clips/u/x/clip_0.mp4")

        boto3_client_factory.return_value.upload_file.assert_called_once_with(
            "/tmp/work/clip.mp4", TEST_BUCKET, "clips/u/x/clip_0.mp4"
        )


class TestProductionEndpointGuard:
    """`APP_ENV="production"` is this backend's equivalent of the frontend's
    `NODE_ENV` for `assertStorageEndpointAllowed`
    (src/infrastructure/storage/storage-endpoint-guard.ts): it guards against
    a dev-only `S3_ENDPOINT_URL` (MinIO via `docker-compose.yml`,
    `http://localhost:9000`) being inherited by mistake into the Modal
    secret, which would make every production run fail trying to reach an
    unreachable host.

    `APP_ENV` does not exist anywhere else in this backend yet (there is no
    `NODE_ENV` equivalent in a plain Python/Modal process) — this is a new
    env var introduced specifically for this guard, defaulting to permissive
    (dev) behavior when unset, matching the frontend's "only enforce in
    production" posture.

    Same rule set as the frontend guard: reject `localhost`, loopback/
    private/link-local IPs, internal hostname suffixes
    (`.local`/`.internal`/`.localhost`), a bare hostname with no dot (e.g.
    the docker-compose service name `minio`), and any non-`https://` scheme.
    The guard only applies inside the `"minio"` branch — `"s3"` never accepts
    `S3_ENDPOINT_URL` at all (see `TestProviderSelection`), so there is
    nothing to validate there.
    """

    @pytest.mark.parametrize(
        "endpoint",
        [
            "http://localhost:9000",
            "http://127.0.0.1:9000",
            "http://0.0.0.0:9000",
            "http://10.0.0.5:9000",
            "http://172.20.0.3:9000",
            "http://192.168.1.10:9000",
            "http://169.254.169.254:9000",
            "http://minio.internal:9000",
            "http://minio.local:9000",
            "http://minio.localhost:9000",
            "http://minio:9000",
            "https://minio:9000",
        ],
        ids=[
            "localhost",
            "loopback-ip",
            "0.0.0.0",
            "private-10",
            "private-172",
            "private-192",
            "link-local",
            "internal-suffix",
            "local-suffix",
            "localhost-suffix",
            "bare-hostname-http",
            "bare-hostname-https",
        ],
    )
    def test_production_rejects_dev_like_endpoint(
        self, boto3_client_factory: MagicMock, endpoint: str
    ):
        with pytest.raises(ValueError, match=re.escape("S3_ENDPOINT_URL")):
            _create_object_storage(
                _env(
                    STORAGE_PROVIDER="minio",
                    S3_ENDPOINT_URL=endpoint,
                    APP_ENV="production",
                )
            )

        boto3_client_factory.assert_not_called()

    def test_production_rejects_public_host_over_plain_http(
        self, boto3_client_factory: MagicMock
    ):
        with pytest.raises(ValueError, match=re.escape("https")):
            _create_object_storage(
                _env(
                    STORAGE_PROVIDER="minio",
                    S3_ENDPOINT_URL="http://minio.minhaempresa.com",
                    APP_ENV="production",
                )
            )

        boto3_client_factory.assert_not_called()

    def test_production_accepts_public_https_endpoint(
        self, boto3_client_factory: MagicMock
    ):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(
            _env(
                STORAGE_PROVIDER="minio",
                S3_ENDPOINT_URL="https://minio.minhaempresa.com",
                APP_ENV="production",
            )
        )

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once()
        _, kwargs = boto3_client_factory.call_args
        assert kwargs.get("endpoint_url") == "https://minio.minhaempresa.com"

    def test_development_app_env_keeps_dev_endpoint_allowed(
        self, boto3_client_factory: MagicMock
    ):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(
            _env(
                STORAGE_PROVIDER="minio",
                S3_ENDPOINT_URL=MINIO_ENDPOINT,
                APP_ENV="development",
            )
        )

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once()

    def test_missing_app_env_keeps_dev_endpoint_allowed(
        self, boto3_client_factory: MagicMock
    ):
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(
            _env(STORAGE_PROVIDER="minio", S3_ENDPOINT_URL=MINIO_ENDPOINT)
        )

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once()

    def test_production_guard_does_not_apply_to_real_aws_s3(
        self, boto3_client_factory: MagicMock
    ):
        # STORAGE_PROVIDER="s3" never reads S3_ENDPOINT_URL at all (forbidden
        # outright, see TestProviderSelection.test_s3_with_endpoint_raises_
        # clear_value_error), so the production guard has nothing to check
        # on this branch regardless of APP_ENV.
        from core.storage.s3_object_storage import S3ObjectStorage

        storage = _create_object_storage(
            _env(STORAGE_PROVIDER="s3", APP_ENV="production")
        )

        assert isinstance(storage, S3ObjectStorage)
        boto3_client_factory.assert_called_once_with("s3")


class TestProductionEndpointGuardIntegration:
    """Integration-level check with the real `boto3` import (no mocking of
    `boto3.client`): proves the guard raises *before* botocore ever attempts
    to build a client for the dev endpoint, exactly as would happen on a
    Modal container boot with a wrongly-inherited dev secret."""

    def test_dev_endpoint_in_production_fails_before_touching_boto3(self):
        from core.storage.factory import create_object_storage

        with pytest.raises(ValueError, match=re.escape("S3_ENDPOINT_URL")):
            create_object_storage(
                _env(
                    STORAGE_PROVIDER="minio",
                    S3_ENDPOINT_URL=MINIO_ENDPOINT,
                    APP_ENV="production",
                )
            )
