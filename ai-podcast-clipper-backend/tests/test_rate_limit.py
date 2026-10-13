"""Unit tests for core/rate_limit.py — RNF-RL-03 (per-IP throttling on the
Python backend endpoints `/process_video` and `/download_youtube`).

The limiter is pure Python (no Modal/Starlette state), shared by both runners
(`main.py` on Modal and `local_server.py`), so it is tested here in isolation
with an injected fake clock — no sleeps.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.rate_limit import (
    SlidingWindowRateLimiter,
    client_ip,
    enforce_rate_limit,
    rate_limit_from_env,
    reset_all_rate_limiters,
)


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _limiter(limit: int = 3, window: float = 60.0, clock: FakeClock | None = None):
    return SlidingWindowRateLimiter(limit=limit, window_seconds=window, clock=clock or FakeClock())


class TestSlidingWindowRateLimiter:
    def test_allows_requests_up_to_the_limit(self):
        limiter = _limiter(limit=3)
        assert [limiter.consume("1.2.3.4").allowed for _ in range(3)] == [True, True, True]

    def test_blocks_the_request_that_exceeds_the_limit(self):
        limiter = _limiter(limit=3)
        for _ in range(3):
            limiter.consume("1.2.3.4")
        decision = limiter.consume("1.2.3.4")
        assert decision.allowed is False

    def test_rejected_requests_do_not_extend_the_block(self):
        """A client hammering while blocked must not push its own unblock
        time forward forever (rejected hits are not recorded)."""
        clock = FakeClock()
        limiter = _limiter(limit=2, window=60, clock=clock)
        limiter.consume("ip")
        limiter.consume("ip")
        for _ in range(50):  # t=1001..1050, all inside the window
            clock.advance(1)
            assert limiter.consume("ip").allowed is False
        clock.now = 1060.5  # both recorded hits (t=1000) left the window
        assert limiter.consume("ip").allowed is True

    def test_keys_are_independent(self):
        limiter = _limiter(limit=1)
        assert limiter.consume("1.1.1.1").allowed is True
        assert limiter.consume("1.1.1.1").allowed is False
        assert limiter.consume("2.2.2.2").allowed is True

    def test_window_slides_old_hits_expire(self):
        clock = FakeClock()
        limiter = _limiter(limit=2, window=60, clock=clock)
        limiter.consume("ip")  # t=1000
        clock.advance(30)
        limiter.consume("ip")  # t=1030
        assert limiter.consume("ip").allowed is False
        clock.advance(30.001)  # t=1060.001 -> first hit left the window
        assert limiter.consume("ip").allowed is True
        assert limiter.consume("ip").allowed is False

    def test_retry_after_is_time_until_oldest_hit_leaves_window(self):
        clock = FakeClock()
        limiter = _limiter(limit=2, window=60, clock=clock)
        limiter.consume("ip")  # t=1000
        clock.advance(20)
        limiter.consume("ip")  # t=1020
        clock.advance(5)  # t=1025
        decision = limiter.consume("ip")
        assert decision.allowed is False
        assert decision.retry_after_seconds == pytest.approx(35.0)

    def test_allowed_decision_has_zero_retry_after(self):
        assert _limiter().consume("ip").retry_after_seconds == 0

    def test_reset_clears_all_counters(self):
        limiter = _limiter(limit=1)
        limiter.consume("ip")
        assert limiter.consume("ip").allowed is False
        limiter.reset()
        assert limiter.consume("ip").allowed is True

    def test_stale_keys_are_pruned_so_memory_stays_bounded(self):
        clock = FakeClock()
        limiter = SlidingWindowRateLimiter(limit=5, window_seconds=60, clock=clock, max_tracked_keys=10)
        for i in range(10):
            limiter.consume(f"10.0.0.{i}")
        clock.advance(61)
        limiter.consume("10.0.1.1")  # over max_tracked_keys -> sweep stale keys
        assert limiter.tracked_keys() == 1

    @pytest.mark.parametrize("limit,window", [(0, 60), (-1, 60), (5, 0), (5, -1)])
    def test_rejects_non_positive_configuration(self, limit, window):
        with pytest.raises(ValueError):
            SlidingWindowRateLimiter(limit=limit, window_seconds=window)


class TestResetAll:
    def test_resets_every_limiter_created(self):
        a, b = _limiter(limit=1), _limiter(limit=1)
        a.consume("ip")
        b.consume("ip")
        reset_all_rate_limiters()
        assert a.consume("ip").allowed is True
        assert b.consume("ip").allowed is True


class TestRateLimitFromEnv:
    def test_uses_default_when_unset(self, monkeypatch):
        monkeypatch.delenv("SOME_LIMIT", raising=False)
        assert rate_limit_from_env("SOME_LIMIT", 10) == 10

    def test_reads_positive_integer(self, monkeypatch):
        monkeypatch.setenv("SOME_LIMIT", "25")
        assert rate_limit_from_env("SOME_LIMIT", 10) == 25

    @pytest.mark.parametrize("raw", ["", "abc", "0", "-3", "1.5"])
    def test_falls_back_to_default_on_invalid_value(self, monkeypatch, raw):
        """Misconfiguration must never disable the limiter (fail closed to
        the default, never to 'unlimited')."""
        monkeypatch.setenv("SOME_LIMIT", raw)
        assert rate_limit_from_env("SOME_LIMIT", 10) == 10


class TestClientIp:
    def test_uses_tcp_peer_address(self):
        request = SimpleNamespace(client=SimpleNamespace(host="203.0.113.7"), headers={})
        assert client_ip(request) == "203.0.113.7"

    def test_ignores_spoofable_x_forwarded_for(self):
        request = SimpleNamespace(
            client=SimpleNamespace(host="203.0.113.7"),
            headers={"x-forwarded-for": "1.1.1.1"},
        )
        assert client_ip(request) == "203.0.113.7"

    def test_missing_client_falls_back_to_shared_bucket(self):
        request = SimpleNamespace(client=None, headers={})
        assert client_ip(request) == "unknown"


class TestEnforceRateLimit:
    def _request(self, host="198.51.100.1"):
        return SimpleNamespace(client=SimpleNamespace(host=host), headers={})

    def test_under_limit_does_not_raise(self):
        limiter = _limiter(limit=1)
        enforce_rate_limit(limiter, self._request())

    def test_over_limit_raises_429_with_retry_after_header(self):
        limiter = _limiter(limit=1, window=60)
        enforce_rate_limit(limiter, self._request())
        with pytest.raises(HTTPException) as exc_info:
            enforce_rate_limit(limiter, self._request())
        assert exc_info.value.status_code == 429
        assert exc_info.value.headers["Retry-After"] == "60"

    def test_retry_after_is_rounded_up_and_at_least_one(self):
        clock = FakeClock()
        limiter = _limiter(limit=1, window=60, clock=clock)
        enforce_rate_limit(limiter, self._request())
        clock.advance(59.6)
        with pytest.raises(HTTPException) as exc_info:
            enforce_rate_limit(limiter, self._request())
        assert exc_info.value.headers["Retry-After"] == "1"
