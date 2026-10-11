"""Unit tests for the ObjectStorage port and core/storage/s3_object_storage.py (RED).

Phase 1b. The port (core/storage/ports.py) has exactly the two methods the
pipeline uses today; the bucket is bound to the adapter instance, not passed
on every call. S3ObjectStorage receives its boto3 client by injection, so these
tests use a MagicMock client and never create a real boto3 client.

Imports are inside the tests so the failures are per test (ModuleNotFoundError
until Fase 2), not a collection error that aborts the whole suite.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

BUCKET = "ai-podcast-clipper-test"


class TestObjectStoragePort:
    """Locks the port signature so both adapters and the call sites agree."""

    def test_download_file_signature(self):
        from core.storage.ports import ObjectStorage

        params = list(inspect.signature(ObjectStorage.download_file).parameters)
        assert params == ["self", "key", "dest_path"]

    def test_upload_file_signature(self):
        from core.storage.ports import ObjectStorage

        params = list(inspect.signature(ObjectStorage.upload_file).parameters)
        assert params == ["self", "src_path", "key"]

    def test_port_declares_only_the_two_methods_the_pipeline_uses(self):
        from core.storage.ports import ObjectStorage

        public_methods = {
            name
            for name, value in vars(ObjectStorage).items()
            if callable(value) and not name.startswith("_")
        }
        assert public_methods == {"download_file", "upload_file"}


class TestS3ObjectStorage:
    def test_download_file_calls_client_with_bucket_key_and_dest(self):
        from core.storage.s3_object_storage import S3ObjectStorage

        client: MagicMock = MagicMock()
        storage = S3ObjectStorage(bucket=BUCKET, client=client)

        storage.download_file("uploads/u/x/podcast.mp4", "/tmp/work/input.mp4")

        client.download_file.assert_called_once_with(
            BUCKET, "uploads/u/x/podcast.mp4", "/tmp/work/input.mp4"
        )

    def test_upload_file_calls_client_with_src_bucket_and_key(self):
        from core.storage.s3_object_storage import S3ObjectStorage

        client: MagicMock = MagicMock()
        storage = S3ObjectStorage(bucket=BUCKET, client=client)

        storage.upload_file("/tmp/work/clip.mp4", "clips/u/x/clip_0.mp4")

        # boto3's upload_file takes (Filename, Bucket, Key): src first, then bucket.
        client.upload_file.assert_called_once_with(
            "/tmp/work/clip.mp4", BUCKET, "clips/u/x/clip_0.mp4"
        )

    def test_injected_client_is_used_and_boto3_is_not_called(self):
        from core.storage.s3_object_storage import S3ObjectStorage

        client: MagicMock = MagicMock()
        with patch("boto3.client") as boto_client:
            storage = S3ObjectStorage(bucket=BUCKET, client=client)
            storage.download_file("k.mp4", "/tmp/k.mp4")

        boto_client.assert_not_called()
        client.download_file.assert_called_once()

    def test_client_errors_propagate_to_the_caller(self):
        # The adapter must not swallow storage errors: the pipeline (and the
        # YouTube endpoint's error mapping) decides what to do with them.
        from core.storage.s3_object_storage import S3ObjectStorage

        client: MagicMock = MagicMock()
        client.download_file.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject"
        )
        storage = S3ObjectStorage(bucket=BUCKET, client=client)

        with pytest.raises(ClientError):
            storage.download_file("missing.mp4", "/tmp/missing.mp4")
