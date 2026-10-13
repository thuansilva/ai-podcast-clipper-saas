import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HealthChecksResult } from "~/infrastructure/health/dependency-health-checks";

const mockRunDependencyHealthChecks =
  vi.fn<() => Promise<HealthChecksResult>>();

vi.mock("~/infrastructure/health/dependency-health-checks", async () => {
  const actual = await vi.importActual<
    typeof import("~/infrastructure/health/dependency-health-checks")
  >("~/infrastructure/health/dependency-health-checks");
  return {
    ...actual,
    runDependencyHealthChecks: () => mockRunDependencyHealthChecks(),
  };
});

import { GET } from "~/app/api/health/route";

const healthyChecks: HealthChecksResult = {
  postgres: { status: "ok", latencyMs: 2 },
  s3: { status: "ok", latencyMs: 5 },
  stripe: { status: "ok", latencyMs: 8 },
  redis: { status: "skipped" },
};

describe("Health Check Route - Unit Tests", () => {
  beforeEach(() => {
    mockRunDependencyHealthChecks.mockReset();
    mockRunDependencyHealthChecks.mockResolvedValue(healthyChecks);
  });

  it("deve retornar status 200 quando todas as dependências estão saudáveis", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("deve retornar { status: 'ok', checks } quando todas as dependências estão saudáveis", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.checks).toEqual(healthyChecks);
  });

  it("deve retornar 200 com status 'degraded' quando S3/Stripe falham mas Postgres está ok (não derruba o probe do CI)", async () => {
    mockRunDependencyHealthChecks.mockResolvedValue({
      postgres: { status: "ok", latencyMs: 2 },
      s3: { status: "error", error: "mock-creds" },
      stripe: { status: "error", error: "mock-creds" },
      redis: { status: "skipped" },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("degraded");
  });

  it("deve retornar 503 quando o Postgres está fora", async () => {
    mockRunDependencyHealthChecks.mockResolvedValue({
      postgres: { status: "error", error: "connection refused" },
      s3: { status: "ok", latencyMs: 2 },
      stripe: { status: "ok", latencyMs: 2 },
      redis: { status: "skipped" },
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
  });

  it("deve retornar Content-Type application/json", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
