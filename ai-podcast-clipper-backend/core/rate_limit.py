"""Per-IP request throttling for the backend HTTP endpoints (RNF-RL-03).

Shared by both runners — `main.py` (Modal) and `local_server.py` (local GPU)
— so `/process_video` and `/download_youtube` behave the same in both. Kept
dependency-free (no slowapi): Modal's `@modal.fastapi_endpoint` exposes each
function as its own isolated endpoint, not one FastAPI app with global
middleware/`app.state`, so a plain FastAPI dependency is the only shape that
fits both runners identically.

Why per IP: the Bearer token is static (one shared secret for the whole
frontend), so it cannot tell callers apart. The TCP peer address
(`request.client.host`) is the only useful dimension. `X-Forwarded-For` is
deliberately ignored — it is client-controlled and would let an attacker
rotate fake IPs to escape the limit. Modal documents `request.client.host`
as the real client IP of a web endpoint.

KNOWN LIMITATION (documented in checklist-go-live.md, not hidden): state lives
in this process's memory. On Modal each container keeps its own counters —
they are NOT shared between replicas and reset on cold start/scale-down. It
throttles a single runaway origin hitting a warm container; it is not a
global guarantee. Swapping in a shared store (e.g. `modal.Dict`/Redis) only
requires a new class with the same `consume(key)` contract.
"""

from __future__ import annotations

import math
import os
import threading
import time
import weakref
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque, Dict

from fastapi import HTTPException, status

UNKNOWN_CLIENT = "unknown"

# Live limiters, so tests can reset module-level singletons of both runners
# without importing `local_server` (which drags torch in).
_REGISTRY: "weakref.WeakSet[SlidingWindowRateLimiter]" = weakref.WeakSet()


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: float = 0.0


class SlidingWindowRateLimiter:
    """At most `limit` accepted requests per key in any `window_seconds`.

    Sliding log: one timestamp per *accepted* hit. Rejected hits are not
    recorded, so a client hammering while blocked does not push its own
    unblock time forward. Thread-safe (FastAPI runs sync endpoints in a
    threadpool). Memory: at most `limit` timestamps per key; keys whose
    window fully expired are swept once `max_tracked_keys` is exceeded.
    """

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
        max_tracked_keys: int = 10_000,
    ):
        if limit <= 0:
            raise ValueError("limit must be a positive integer")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._max_tracked_keys = max_tracked_keys
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()
        _REGISTRY.add(self)

    def consume(self, key: str) -> RateLimitDecision:
        with self._lock:
            now = self._clock()
            window_start = now - self.window_seconds
            hits = self._hits.get(key)
            if hits is None:
                if len(self._hits) >= self._max_tracked_keys:
                    self._sweep(window_start)
                hits = self._hits[key] = deque()
            while hits and hits[0] <= window_start:
                hits.popleft()

            if len(hits) >= self.limit:
                return RateLimitDecision(
                    allowed=False,
                    retry_after_seconds=hits[0] + self.window_seconds - now,
                )

            hits.append(now)
            return RateLimitDecision(allowed=True)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._hits)

    def _sweep(self, window_start: float) -> None:
        stale = [k for k, hits in self._hits.items() if not hits or hits[-1] <= window_start]
        for k in stale:
            del self._hits[k]


def reset_all_rate_limiters() -> None:
    for limiter in list(_REGISTRY):
        limiter.reset()


def rate_limit_from_env(name: str, default: int) -> int:
    """Positive int from env var `name`; anything else (unset, empty,
    non-integer, <= 0) falls back to `default` — misconfiguration must never
    turn the limiter off."""
    raw = (os.environ.get(name) or "").strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def client_ip(request) -> str:
    """TCP peer address only (see module docstring on X-Forwarded-For)."""
    client = getattr(request, "client", None)
    host = getattr(client, "host", None) if client is not None else None
    return host or UNKNOWN_CLIENT


def enforce_rate_limit(limiter: SlidingWindowRateLimiter, request) -> None:
    decision = limiter.consume(client_ip(request))
    if decision.allowed:
        return
    retry_after = max(1, math.ceil(decision.retry_after_seconds))
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests, please retry later",
        headers={"Retry-After": str(retry_after)},
    )


# Defaults shared by both runners (RNF-RL-03). Rationale in
# docs/requisitos/requisitos-funcionais-e-nao-funcionais.md (RNF-RL-03).
WINDOW_SECONDS = 60
PROCESS_VIDEO_LIMIT_ENV = "PROCESS_VIDEO_RATE_LIMIT_PER_MINUTE"
DOWNLOAD_YOUTUBE_LIMIT_ENV = "DOWNLOAD_YOUTUBE_RATE_LIMIT_PER_MINUTE"
DEFAULT_PROCESS_VIDEO_LIMIT = 10
DEFAULT_DOWNLOAD_YOUTUBE_LIMIT = 30


def make_process_video_rate_limiter() -> SlidingWindowRateLimiter:
    return SlidingWindowRateLimiter(
        limit=rate_limit_from_env(PROCESS_VIDEO_LIMIT_ENV, DEFAULT_PROCESS_VIDEO_LIMIT),
        window_seconds=WINDOW_SECONDS,
    )


def make_download_youtube_rate_limiter() -> SlidingWindowRateLimiter:
    return SlidingWindowRateLimiter(
        limit=rate_limit_from_env(DOWNLOAD_YOUTUBE_LIMIT_ENV, DEFAULT_DOWNLOAD_YOUTUBE_LIMIT),
        window_seconds=WINDOW_SECONDS,
    )
