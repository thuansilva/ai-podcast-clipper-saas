"""Single source of truth for which `ObjectStorage` adapter the pipeline
uses, built from environment config shared by `main.py` (Modal) and
`local_server.py` (local GPU runner).

Env vars:
  - `STORAGE_PROVIDER` (default `"s3"`): exactly 2 valid values, both backed
    by the same `S3ObjectStorage` class (the difference is only which kwargs
    reach `boto3.client`):
      - `"s3"` -> real AWS S3. `S3_ENDPOINT_URL` must NOT be set in this mode
        (`ValueError` if it is, with no silent fallback) — the two concepts
        used to be conflated ("s3" + an endpoint secretly meant MinIO), which
        was confusing enough to be worth a hard error instead.
      - `"minio"` -> any S3-compatible self-hosted server (MinIO via Docker
        locally, or a real MinIO deployment in production). `S3_ENDPOINT_URL`
        is required in this mode (`ValueError` if missing/empty).
    Any other value (including the removed `"local"`, which used to select a
    local-filesystem adapter that no longer exists) is a `ValueError`, never
    a silent fallback.
  - `S3_ENDPOINT_URL`: required for `"minio"`, forbidden for `"s3"` (see
    above). When set, the boto3 client is built with `endpoint_url=...` and
    path-style addressing (`config=Config(s3={"addressing_style": "path"})`),
    since MinIO requires it. When unset (real AWS), the client is built with
    exactly `boto3.client("s3")` (plus `region_name=` if `AWS_REGION` is set)
    — a byte-for-byte regression guard for the original real-AWS call.
  - `AWS_REGION` (optional): read explicitly and passed as `region_name=` to
    `boto3.client("s3", ...)`. boto3 does NOT read `AWS_REGION` on its own —
    only `AWS_DEFAULT_REGION` is understood by its automatic env detection
    (confirmed by direct test: setting only `AWS_REGION` makes boto3 fall
    back to `us-east-1`, silently ignoring the value). The frontend already
    uses `AWS_REGION`, so this factory reads it explicitly here to keep a
    single env var name across both sides of the monorepo. If unset, no
    `region_name` kwarg is passed — same fallback behavior as before this
    change (boto3/AWS resolves it some other way).
  - `S3_BUCKET_NAME` (default `"ai-podcast-clipper"`): bucket bound to the
    `S3ObjectStorage` instance. Always comes from this central config, never
    from a per-request value.
  - `APP_ENV` (default `"development"`): this backend's equivalent of the
    frontend's `NODE_ENV` for the same purpose — there is no `NODE_ENV` in a
    plain Python/Modal process, so `APP_ENV` is introduced here specifically
    to gate the guard below. Not read anywhere else in the backend yet; this
    is a new convention, open to revisiting. Only `"production"` activates
    the guard; any other value (including unset) keeps today's permissive
    dev behavior.
  - Production guard on `S3_ENDPOINT_URL` (only when `APP_ENV == "production"`,
    `"minio"` branch only — `"s3"` never accepts an endpoint at all): rejects
    a dev-only endpoint being inherited by mistake into a production secret
    (e.g. the Modal secret `ai-podcast-clipper-secret` keeping
    `S3_ENDPOINT_URL=http://localhost:9000` from local MinIO), which would
    otherwise make every production run fail trying to reach an unreachable
    host. Same rule set as the frontend's `assertStorageEndpointAllowed`
    (`ai-podcast-clipper-frontend/src/infrastructure/storage/storage-endpoint-guard.ts`):
    rejects `localhost`, loopback/private/link-local IPs, internal hostname
    suffixes (`.local`/`.internal`/`.localhost`), a bare hostname with no dot
    (e.g. the docker-compose service name `minio`), and any non-`https://`
    scheme. Raises `ValueError` with an actionable message, mirroring the
    style already used throughout this factory.
"""

import ipaddress
import os
from typing import Mapping, Optional
from urllib.parse import urlparse

import boto3
from botocore.config import Config

from core.storage.ports import ObjectStorage
from core.storage.s3_object_storage import S3ObjectStorage

DEFAULT_BUCKET = "ai-podcast-clipper"

_INTERNAL_HOST_SUFFIXES = (".localhost", ".local", ".internal")


def _is_private_or_loopback_ip(host: str) -> bool:
    """Mirrors the frontend's IPv4/IPv6 private/loopback/link-local checks.

    `urlparse(...).hostname` already strips IPv6 brackets and lowercases the
    host, so IPv4 and IPv6 literals are told apart by the presence of `:`.
    """
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local


def _unsafe_storage_endpoint_reason(hostname: str) -> Optional[str]:
    host = hostname.lower()
    if host == "localhost":
        return "host é localhost"
    if any(host.endswith(suffix) for suffix in _INTERNAL_HOST_SUFFIXES):
        return "host é um nome interno/de rede local"
    if _is_private_or_loopback_ip(host):
        return "host é um IP de loopback/privado/link-local"
    if ":" not in host and "." not in host:
        # e.g. "minio" (docker-compose service name) — never a real public
        # domain.
        return "host é um nome sem domínio (ex.: serviço do docker-compose)"
    return None


def _assert_storage_endpoint_allowed_in_production(
    endpoint: str, app_env: Optional[str]
) -> None:
    if app_env != "production":
        return

    parsed = urlparse(endpoint)
    reason: Optional[str]
    if not parsed.scheme or not parsed.hostname:
        reason = "não é uma URL válida"
    else:
        reason = _unsafe_storage_endpoint_reason(parsed.hostname)
        if reason is None and parsed.scheme != "https":
            reason = "protocolo precisa ser https"

    if reason is not None:
        raise ValueError(
            f"APP_ENV=\"production\": S3_ENDPOINT_URL inválido ({endpoint!r}): "
            f"{reason}. Em produção, use um endpoint público com https:// (ou "
            'remova S3_ENDPOINT_URL e use STORAGE_PROVIDER="s3" para o AWS S3 '
            "real)."
        )


def create_object_storage(env: Mapping[str, str] = os.environ) -> ObjectStorage:
    provider = env.get("STORAGE_PROVIDER", "s3")

    if provider not in ("s3", "minio"):
        raise ValueError(
            f"STORAGE_PROVIDER has an unknown value: {provider!r}. "
            'Expected "s3" or "minio".'
        )

    bucket = env.get("S3_BUCKET_NAME", DEFAULT_BUCKET)
    endpoint_url = env.get("S3_ENDPOINT_URL") or None
    region_name = env.get("AWS_REGION") or None
    region_kwargs = {"region_name": region_name} if region_name else {}

    if provider == "s3":
        if endpoint_url:
            raise ValueError(
                "STORAGE_PROVIDER=\"s3\" does not accept S3_ENDPOINT_URL "
                f"(got {endpoint_url!r}). Real AWS S3 never needs a custom "
                'endpoint; use STORAGE_PROVIDER="minio" for a self-hosted '
                "S3-compatible server instead."
            )
        client = boto3.client("s3", **region_kwargs)
    else:
        if not endpoint_url:
            raise ValueError(
                'STORAGE_PROVIDER="minio" requires S3_ENDPOINT_URL to be set '
                "to the MinIO server's URL (e.g. http://localhost:9000 for "
                "local Docker, or a real host in production)."
            )
        _assert_storage_endpoint_allowed_in_production(
            endpoint_url, env.get("APP_ENV")
        )
        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            config=Config(s3={"addressing_style": "path"}),
            **region_kwargs,
        )

    return S3ObjectStorage(bucket=bucket, client=client)
