/**
 * @vitest-environment node
 *
 * Decisão de design (ver AGENTS.md raiz do monorepo / tarefa HIGH do
 * checklist go-live): a factory escolhe a implementação de `IRateLimiter`
 * com base na presença das env vars do Upstash — sem rodar nenhum teste
 * contra infra real (ver `upstash-redis-rate-limiter.test.ts` para o
 * comportamento da implementação Redis isolada).
 *
 * - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ausentes →
 *   `InMemorySlidingWindowRateLimiter` (comportamento de hoje).
 * - Ambas presentes → `UpstashRedisRateLimiter`.
 *
 * Os 5 factories (`make*RateLimiter`) são singletons de módulo (ver
 * comentário em `rate-limiter-factory.ts`), então cada teste precisa de um
 * `vi.resetModules()` + reimport para observar a env var no momento do
 * import do módulo.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("rate-limiter-factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sem UPSTASH_REDIS_REST_URL/TOKEN, make*RateLimiter() devolve InMemorySlidingWindowRateLimiter", async () => {
    vi.doMock("~/env", () => ({
      env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
    }));

    const { InMemorySlidingWindowRateLimiter } = await import(
      "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter"
    );
    const {
      makeUploadUrlRateLimiter,
      makeYouTubeImportRateLimiter,
      makeYouTubeInfoRateLimiter,
      makeProjectActionRateLimiter,
      makeBillingActionRateLimiter,
    } = await import("~/infrastructure/factories/rate-limiter-factory");

    expect(makeUploadUrlRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
    expect(makeYouTubeImportRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
    expect(makeYouTubeInfoRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
    expect(makeProjectActionRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
    expect(makeBillingActionRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
  });

  it("com apenas UPSTASH_REDIS_REST_URL (sem TOKEN), ainda cai para InMemorySlidingWindowRateLimiter", async () => {
    vi.doMock("~/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: undefined,
      },
    }));

    const { InMemorySlidingWindowRateLimiter } = await import(
      "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter"
    );
    const { makeUploadUrlRateLimiter } = await import(
      "~/infrastructure/factories/rate-limiter-factory"
    );

    expect(makeUploadUrlRateLimiter()).toBeInstanceOf(
      InMemorySlidingWindowRateLimiter
    );
  });

  it("com UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN presentes, make*RateLimiter() devolve UpstashRedisRateLimiter", async () => {
    vi.doMock("~/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "fake-token",
      },
    }));

    const { UpstashRedisRateLimiter } = await import(
      "~/infrastructure/rate-limiting/upstash-redis-rate-limiter"
    );
    const {
      makeUploadUrlRateLimiter,
      makeYouTubeImportRateLimiter,
      makeYouTubeInfoRateLimiter,
      makeProjectActionRateLimiter,
      makeBillingActionRateLimiter,
    } = await import("~/infrastructure/factories/rate-limiter-factory");

    expect(makeUploadUrlRateLimiter()).toBeInstanceOf(UpstashRedisRateLimiter);
    expect(makeYouTubeImportRateLimiter()).toBeInstanceOf(
      UpstashRedisRateLimiter
    );
    expect(makeYouTubeInfoRateLimiter()).toBeInstanceOf(
      UpstashRedisRateLimiter
    );
    expect(makeProjectActionRateLimiter()).toBeInstanceOf(
      UpstashRedisRateLimiter
    );
    expect(makeBillingActionRateLimiter()).toBeInstanceOf(
      UpstashRedisRateLimiter
    );
  });

  it("make*RateLimiter() continua devolvendo o mesmo singleton em chamadas repetidas (estado precisa persistir entre calls)", async () => {
    vi.doMock("~/env", () => ({
      env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
    }));

    const { makeUploadUrlRateLimiter } = await import(
      "~/infrastructure/factories/rate-limiter-factory"
    );

    expect(makeUploadUrlRateLimiter()).toBe(makeUploadUrlRateLimiter());
  });
});
