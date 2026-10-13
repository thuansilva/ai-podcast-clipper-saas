import { describe, it, expect, vi } from "vitest";
import {
  UpstashRedisRateLimiter,
  type RateLimiterRedisClient,
} from "~/infrastructure/rate-limiting/upstash-redis-rate-limiter";

/**
 * Fake Upstash Redis client that models the same fixed-window semantics the
 * real server implements for `INCR` + `PEXPIRE key ms NX`:
 * - `INCR` creates the key with count 1 if absent or expired, otherwise
 *   increments it.
 * - `PEXPIRE ... NX` only sets a TTL if the key doesn't already have one.
 * - A fake, test-controlled clock (not `vi.useFakeTimers`, since the
 *   production code never reads `Date.now()` itself — only this fake does,
 *   to emulate Redis TTL expiry) drives window resets.
 */
class FakeUpstashRedisClient implements RateLimiterRedisClient {
  private readonly store = new Map<
    string,
    { count: number; expiresAt: number | null }
  >();

  constructor(private now: number) {}

  advanceTime(ms: number): void {
    this.now += ms;
  }

  pipeline(): ReturnType<RateLimiterRedisClient["pipeline"]> {
    const ops: Array<() => number> = [];
    const incr = vi.fn((key: string) => {
      ops.push(() => {
        const entry = this.store.get(key);
        const expired = entry?.expiresAt !== null && (entry?.expiresAt ?? 0) <= this.now;
        if (!entry || expired) {
          this.store.set(key, { count: 1, expiresAt: null });
          return 1;
        }
        entry.count += 1;
        return entry.count;
      });
    });
    const pexpire = vi.fn((key: string, ms: number, option?: "NX") => {
      ops.push(() => {
        const entry = this.store.get(key);
        if (!entry) return 0;
        if (option === "NX" && entry.expiresAt !== null) return 0;
        entry.expiresAt = this.now + ms;
        return 1;
      });
    });
    // `exec` is kept non-generic here on purpose: wrapping a genuinely
    // generic method in `vi.fn()` loses the type parameter (TS infers a
    // concrete `unknown[]` return instead), which breaks structural
    // assignability against `RateLimiterRedisClient["pipeline"]"]`'s
    // `exec<T>` signature. The `as` cast on the returned object (not on
    // `exec` itself) is the narrowest way around that, while still keeping
    // `exec` spyable via `vi.fn` for the "called once" assertion below.
    const exec = vi.fn(async () => ops.map((op) => op()));
    return { incr, pexpire, exec } as unknown as ReturnType<
      RateLimiterRedisClient["pipeline"]
    >;
  }
}

describe("UpstashRedisRateLimiter", () => {
  it("permite requisições até o limite dentro da janela", async () => {
    const client = new FakeUpstashRedisClient(0);
    const limiter = new UpstashRedisRateLimiter(3, 60_000, client);

    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(true);
  });

  it("bloqueia a requisição que excede o limite dentro da janela", async () => {
    const client = new FakeUpstashRedisClient(0);
    const limiter = new UpstashRedisRateLimiter(3, 60_000, client);

    await limiter.consume("user-1");
    await limiter.consume("user-1");
    await limiter.consume("user-1");

    expect(await limiter.consume("user-1")).toBe(false);
  });

  it("libera novamente após a janela expirar (TTL do Redis)", async () => {
    const client = new FakeUpstashRedisClient(0);
    const limiter = new UpstashRedisRateLimiter(2, 60_000, client);

    await limiter.consume("user-1");
    await limiter.consume("user-1");
    expect(await limiter.consume("user-1")).toBe(false);

    client.advanceTime(60_001);

    expect(await limiter.consume("user-1")).toBe(true);
  });

  it("mantém contadores independentes por chave", async () => {
    const client = new FakeUpstashRedisClient(0);
    const limiter = new UpstashRedisRateLimiter(1, 60_000, client);

    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(false);
    expect(await limiter.consume("user-2")).toBe(true);
  });

  it("executa INCR e PEXPIRE...NX num único pipeline atômico (não um GET+SET separado)", async () => {
    const client = new FakeUpstashRedisClient(0);
    const pipelineSpy = vi.spyOn(client, "pipeline");
    const limiter = new UpstashRedisRateLimiter(5, 60_000, client);

    await limiter.consume("user-1");

    expect(pipelineSpy).toHaveBeenCalledTimes(1);
    const pipelineInstance = pipelineSpy.mock.results[0]!.value as ReturnType<
      FakeUpstashRedisClient["pipeline"]
    >;
    expect(pipelineInstance.incr).toHaveBeenCalledExactlyOnceWith(
      "ratelimit:user-1"
    );
    expect(pipelineInstance.pexpire).toHaveBeenCalledExactlyOnceWith(
      "ratelimit:user-1",
      60_000,
      "NX"
    );
    expect(pipelineInstance.exec).toHaveBeenCalledTimes(1);
  });
});
