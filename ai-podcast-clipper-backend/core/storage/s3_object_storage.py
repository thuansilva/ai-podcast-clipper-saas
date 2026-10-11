"""S3-compatible `ObjectStorage` adapter (real AWS S3 or MinIO, selected by
the boto3 client injected at construction — see `core/storage/factory.py`).
"""

from typing import Any


class S3ObjectStorage:
    """Binds a bucket and a boto3 S3 client to the `ObjectStorage` port.

    The client is always injected, never created here: the factory is the
    single place that decides whether it talks to real AWS or to a MinIO
    endpoint (path-style addressing, custom `endpoint_url`).
    """

    def __init__(self, bucket: str, client: Any) -> None:
        self._bucket = bucket
        self._client = client

    def download_file(self, key: str, dest_path: str) -> None:
        self._client.download_file(self._bucket, key, dest_path)

    def upload_file(self, src_path: str, key: str) -> None:
        self._client.upload_file(src_path, self._bucket, key)
