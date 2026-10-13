import { Redis } from "@upstash/redis";
import type { IRateLimiter } from "~/domain/ports/rate-limiter";
import { env } from "~/env";

/**
 * Minimal surface of the Upstash Redis client this limiter needs — narrower
 * than the full `Redis` class from `@upstash/redis`, so unit tests can
 * inject a lightweight fake/mock instead of hitting the network.
 */
export interface RateLimiterRedisClient {
  pipeline(): {
    incr(key: string): unknown;
    pexpire(key: string, milliseconds: number, option?: "NX"): unknown;
    exec<T extends unknown[]>(): Promise<T>;
  };
}

/**
 * Redis-backed (Upstash REST) rate limiter with shared state across
 * instances/processes — the fix for the in-memory limiter's per-instance
 * limitation on serverless (see
 * `in-memory-sliding-window-rate-limiter.ts`).
 *
 * Algorithm: **fixed window counter**, not a sliding window log. Chosen over
 * a sorted-set-based sliding window (`ZADD` + `ZREMRANGEBYSCORE` + `ZCARD`)
 * because:
 * - It needs only 2 Redis commands per `consume()` call (`INCR` +
 *   `PEXPIRE ... NX`), sent together in a single pipeline request, vs. 3+
 *   commands for a sorted-set sliding window. Upstash's REST API is billed
 *   per request, so fewer commands per call matters.
 * - It is atomic without a read-then-write race: `INCR` always runs and
 *   returns the post-increment count; `PEXPIRE key ms NX` (Redis >= 7,
 *   supported by Upstash) only sets a TTL the first time the key is created
 *   in a window and is a no-op on every later hit within the same window —
 *   so there's no gap between "check the count" and "set the expiry" where
 *   a crash could leave a counter without a TTL.
 *
 * Trade-off accepted: a fixed window can momentarily allow close to
 * `2 * limit` requests across a window boundary (e.g. `limit` requests in
 * the last millisecond of one window, then `limit` more in the first
 * millisecond of the next). A true sliding window log avoids that at the
 * cost of extra Redis commands/memory (one entry per request instead of one
 * counter). Given the limits this backs (5-20 requests per 60s, see
 * `rate-limiter-factory.ts`) — throttling bursts of abuse/retries, not a
 * hard SLA — that edge case isn't worth the extra complexity here.
 */
export class UpstashRedisRateLimiter implements IRateLimiter {
  private readonly redis: RateLimiterRedisClient;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    redisClient?: RateLimiterRedisClient
  ) {
    this.redis =
      redisClient ??
      new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });
  }

  async consume(key: string): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const pipeline = this.redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.pexpire(redisKey, this.windowMs, "NX");
    const [count] = await pipeline.exec<[number, number]>();

    return count <= this.limit;
  }
}
