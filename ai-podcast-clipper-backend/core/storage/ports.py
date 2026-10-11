"""Port (interface) the video processing pipeline uses to move files to/from
whatever object storage backend is configured (real S3, MinIO, or a local
filesystem fallback for dev) — see `core/storage/factory.py` for the
selection logic.

Declared as a `typing.Protocol` on purpose: concrete adapters (and test
doubles, e.g. `tests/storage_fakes.py::FakeObjectStorage`) do not need to
inherit from it, they just need to implement the same two methods.
"""

from typing import Protocol


class ObjectStorage(Protocol):
    """Moves a single named object to/from local disk.

    The bucket (or equivalent namespace) is bound to the adapter instance
    at construction time, never passed per call — callers only ever deal in
    `key`/`dest_path`/`src_path`.
    """

    def download_file(self, key: str, dest_path: str) -> None:
        """Downloads the object stored under `key` to the local `dest_path`."""
        ...

    def upload_file(self, src_path: str, key: str) -> None:
        """Uploads the local file at `src_path` to the object named `key`."""
        ...
