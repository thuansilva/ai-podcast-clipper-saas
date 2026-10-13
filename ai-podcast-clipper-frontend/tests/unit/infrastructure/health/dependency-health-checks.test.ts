import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryRaw = vi.fn();
const mockS3Send = vi.fn();
const mockBalanceRetrieve = vi.fn();
const mockFetch = vi.fn();

vi.mock("~/server/db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(...args: unknown[]) {
      return mockS3Send(...args);
    }
  }
  class MockHeadBucketCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: MockS3Client,
    HeadBucketCommand: MockHeadBucketCommand,
  };
});

vi.mock("stripe", () => {
  class MockStripe {
    balance = {
      retrieve: (...args: unknown[]) => mockBalanceRetrieve(...args),
    };
  }
  return { default: MockStripe };
});

vi.mock("~/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    S3_BUCKET_NAME: "test-bucket",
    S3_ENDPOINT_URL: undefined,
    STRIPE_SECRET_KEY: "sk_test_mock",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  },
}));

import {
  isRedisConfigured,
  probePostgres,
  probeRedis,
  probeS3,
  probeStripe,
  resolveOverallHealth,
  runCheck,
  runDependencyHealthChecks,
  withTimeout,
  type HealthChecksResult,
} from "~/infrastructure/health/dependency-health-checks";
import { env } from "~/env";

vi.stubGlobal("fetch", mockFetch);

describe("dependency-health-checks", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockS3Send.mockReset();
    mockBalanceRetrieve.mockReset();
    mockFetch.mockReset();
    (env as any).UPSTASH_REDIS_REST_URL = undefined;
    (env as any).UPSTASH_REDIS_REST_TOKEN = undefined;
    (env as any).S3_ENDPOINT_URL = undefined;
  });

  describe("probePostgres", () => {
    it("resolve quando o Postgres responde SELECT 1", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      await expect(probePostgres()).resolves.toBeUndefined();
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it("propaga o erro quando a query falha", async () => {
      mockQueryRaw.mockRejectedValue(new Error("connection refused"));
      await expect(probePostgres()).rejects.toThrow("connection refused");
    });
  });

  describe("probeS3", () => {
    it("resolve quando HeadBucketCommand é aceito", async () => {
      mockS3Send.mockResolvedValue({});
      await expect(probeS3()).resolves.toBeUndefined();
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it("propaga o erro quando o bucket não responde", async () => {
      mockS3Send.mockRejectedValue(new Error("NoSuchBucket"));
      await expect(probeS3()).rejects.toThrow("NoSuchBucket");
    });
  });

  describe("probeStripe", () => {
    it("resolve quando balance.retrieve responde", async () => {
      mockBalanceRetrieve.mockResolvedValue({ available: [] });
      await expect(probeStripe()).resolves.toBeUndefined();
      expect(mockBalanceRetrieve).toHaveBeenCalledTimes(1);
    });

    it("propaga o erro quando a Stripe rejeita a chamada", async () => {
      mockBalanceRetrieve.mockRejectedValue(new Error("Invalid API Key"));
      await expect(probeStripe()).rejects.toThrow("Invalid API Key");
    });
  });

  describe("isRedisConfigured / probeRedis", () => {
    it("retorna false quando as env vars do Upstash estão ausentes", () => {
      expect(isRedisConfigured()).toBe(false);
    });

    it("retorna true quando ambas env vars do Upstash estão presentes", () => {
      (env as any).UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
      (env as any).UPSTASH_REDIS_REST_TOKEN = "token-123";
      expect(isRedisConfigured()).toBe(true);
    });

    it("resolve quando o ping do Upstash responde 200", async () => {
      (env as any).UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
      (env as any).UPSTASH_REDIS_REST_TOKEN = "token-123";
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await expect(probeRedis()).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://upstash.example.com/ping",
        expect.objectContaining({
          headers: { Authorization: "Bearer token-123" },
        })
      );
    });

    it("lança erro quando o ping do Upstash responde não-2xx", async () => {
      (env as any).UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
      (env as any).UPSTASH_REDIS_REST_TOKEN = "token-123";
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(probeRedis()).rejects.toThrow("HTTP 500");
    });
  });

  describe("runCheck", () => {
    it("retorna status ok com latencyMs quando a probe resolve", async () => {
      const result = await runCheck(async () => {
        /* resolve imediatamente */
      });
      expect(result.status).toBe("ok");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("retorna status error com a mensagem quando a probe rejeita", async () => {
      const result = await runCheck(async () => {
        throw new Error("boom");
      });
      expect(result.status).toBe("error");
      expect(result.error).toBe("boom");
    });

    it("retorna status error quando a probe excede o timeout", async () => {
      const neverResolves = () => new Promise<void>(() => {});
      const result = await runCheck(neverResolves, 20);
      expect(result.status).toBe("error");
      expect(result.error).toMatch(/Timed out/);
    });
  });

  describe("withTimeout", () => {
    it("resolve com o valor da promise quando ela termina antes do timeout", async () => {
      await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe(
        "ok"
      );
    });

    it("rejeita quando a promise não resolve dentro do timeout", async () => {
      const neverResolves = new Promise<void>(() => {});
      await expect(withTimeout(neverResolves, 20)).rejects.toThrow(
        /Timed out/
      );
    });
  });

  describe("runDependencyHealthChecks", () => {
    it("reporta redis como 'skipped' quando o Upstash não está configurado", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockS3Send.mockResolvedValue({});
      mockBalanceRetrieve.mockResolvedValue({ available: [] });

      const result = await runDependencyHealthChecks();

      expect(result.postgres.status).toBe("ok");
      expect(result.s3.status).toBe("ok");
      expect(result.stripe.status).toBe("ok");
      expect(result.redis).toEqual({ status: "skipped" });
    });

    it("roda os checks em paralelo (nenhum espera o outro terminar)", async () => {
      const order: string[] = [];
      mockQueryRaw.mockImplementation(async () => {
        order.push("postgres-start");
        await new Promise((r) => setTimeout(r, 10));
        order.push("postgres-end");
        return [];
      });
      mockS3Send.mockImplementation(async () => {
        order.push("s3-start");
        return {};
      });
      mockBalanceRetrieve.mockImplementation(async () => {
        order.push("stripe-start");
        return {};
      });

      await runDependencyHealthChecks();

      // s3/stripe começam antes do postgres terminar — prova de paralelismo.
      expect(order.indexOf("s3-start")).toBeLessThan(
        order.indexOf("postgres-end")
      );
      expect(order.indexOf("stripe-start")).toBeLessThan(
        order.indexOf("postgres-end")
      );
    });
  });

  describe("resolveOverallHealth", () => {
    const okResult = { status: "ok" as const, latencyMs: 5 };
    const errorResult = { status: "error" as const, error: "boom" };
    const skippedResult = { status: "skipped" as const };

    it("retorna ok/200 quando todas as dependências estão saudáveis", () => {
      const checks: HealthChecksResult = {
        postgres: okResult,
        s3: okResult,
        stripe: okResult,
        redis: skippedResult,
      };
      expect(resolveOverallHealth(checks)).toEqual({
        status: "ok",
        httpStatus: 200,
      });
    });

    it("retorna degraded/200 quando S3/Stripe falham mas Postgres está ok", () => {
      const checks: HealthChecksResult = {
        postgres: okResult,
        s3: errorResult,
        stripe: errorResult,
        redis: skippedResult,
      };
      expect(resolveOverallHealth(checks)).toEqual({
        status: "degraded",
        httpStatus: 200,
      });
    });

    it("retorna degraded/503 quando o Postgres está fora", () => {
      const checks: HealthChecksResult = {
        postgres: errorResult,
        s3: okResult,
        stripe: okResult,
        redis: skippedResult,
      };
      expect(resolveOverallHealth(checks)).toEqual({
        status: "degraded",
        httpStatus: 503,
      });
    });

    it("retorna degraded/503 quando Postgres e as demais dependências estão fora", () => {
      const checks: HealthChecksResult = {
        postgres: errorResult,
        s3: errorResult,
        stripe: errorResult,
        redis: errorResult,
      };
      expect(resolveOverallHealth(checks)).toEqual({
        status: "degraded",
        httpStatus: 503,
      });
    });
  });
});
