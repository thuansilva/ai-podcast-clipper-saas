"""In-memory test double for the `ObjectStorage` port (core/storage/ports.py).

Used by every unit test that previously mocked `boto3.client` directly. It
records each call so tests can assert on what the pipeline asked for, without
talking to S3, MinIO or any other backend.

The double is structural (duck-typed) on purpose: it implements the same two
methods as the Protocol and does not inherit from it, so it also keeps working
if the port ever grows a method that the pipeline does not use.
"""

from typing import Dict, List, Optional, Tuple


class FakeObjectStorage:
    """Records `download_file`/`upload_file` calls and serves downloads from `files`.

    - `files`: key -> bytes returned by `download_file`. A download of an
      unknown key raises FileNotFoundError, mirroring a missing object.
    - `upload_error`: if set, `upload_file` raises it (simulates a failed upload).
    """

    def __init__(
        self,
        files: Optional[Dict[str, bytes]] = None,
        upload_error: Optional[BaseException] = None,
    ) -> None:
        self.files: Dict[str, bytes] = dict(files or {})
        self.upload_error: Optional[BaseException] = upload_error
        # (key, dest_path) in call order
        self.downloads: List[Tuple[str, str]] = []
        # (src_path, key) in call order
        self.uploads: List[Tuple[str, str]] = []

    def download_file(self, key: str, dest_path: str) -> None:
        self.downloads.append((key, dest_path))
        if key not in self.files:
            raise FileNotFoundError(f"fake storage has no object for key {key!r}")
        with open(dest_path, "wb") as dest:
            dest.write(self.files[key])

    def upload_file(self, src_path: str, key: str) -> None:
        self.uploads.append((src_path, key))
        if self.upload_error is not None:
            raise self.upload_error
