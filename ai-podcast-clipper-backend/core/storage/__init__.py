"""Pluggable object storage: a single `ObjectStorage` port with S3/local
(and MinIO, via S3 + `S3_ENDPOINT_URL`) adapters, selected by
`create_object_storage` (see `core/storage/factory.py`).
"""
