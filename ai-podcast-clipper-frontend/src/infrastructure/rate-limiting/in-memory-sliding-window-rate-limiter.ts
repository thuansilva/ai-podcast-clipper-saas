import type { IRateLimiter } from "~/domain/ports/rate-limiter";

/**
 * In-memory sliding-window rate limiter.
 *
 * CAVEAT: state lives in this process's memory only. On a multi-instance or
 * serverless deployment (e.g. Vercel), each instance keeps its own counters,
 * so this throttles per-instance rather than with a single global count per
 * key. It stops a single runaway client/instance and is a reasonable
 * starting point without adding a new infra dependency, but it is not a hard
 * global guarantee. For that, swap this implementation for one backed by
 * shared storage (e.g. Upstash Redis) behind the same IRateLimiter port —
 * call sites don't need to change.
 */
export class InMemorySlidingWindowRateLimiter implements IRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  async consume(key: string): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart
    );

    if (timestamps.length >= this.limit) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }
}
