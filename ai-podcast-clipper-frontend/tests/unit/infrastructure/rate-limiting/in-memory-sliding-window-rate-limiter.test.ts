import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemorySlidingWindowRateLimiter } from "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter";

describe("InMemorySlidingWindowRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite requisições até o limite dentro da janela", async () => {
    const limiter = new InMemorySlidingWindowRateLimiter(3, 60_000);

    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(true);
  });

  it("bloqueia a requisição que excede o limite dentro da janela", async () => {
    const limiter = new InMemorySlidingWindowRateLimiter(3, 60_000);

    await limiter.consume("user-1");
    await limiter.consume("user-1");
    await limiter.consume("user-1");

    expect(await limiter.consume("user-1")).toBe(false);
  });

  it("libera novamente após a janela expirar", async () => {
    const limiter = new InMemorySlidingWindowRateLimiter(2, 60_000);

    await limiter.consume("user-1");
    await limiter.consume("user-1");
    expect(await limiter.consume("user-1")).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(await limiter.consume("user-1")).toBe(true);
  });

  it("mantém contadores independentes por chave", async () => {
    const limiter = new InMemorySlidingWindowRateLimiter(1, 60_000);

    expect(await limiter.consume("user-1")).toBe(true);
    expect(await limiter.consume("user-1")).toBe(false);
    expect(await limiter.consume("user-2")).toBe(true);
  });
});
