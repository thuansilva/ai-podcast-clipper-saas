/**
 * Port for a per-key rate limiter. Implementations decide the algorithm
 * (sliding window, token bucket, etc.) and where state lives (memory,
 * Redis/Upstash, ...).
 */
export interface IRateLimiter {
  /**
   * Registers one attempt for `key`.
   * @returns true if the attempt is allowed, false if the key is currently rate-limited.
   */
  consume(key: string): Promise<boolean>;
}
