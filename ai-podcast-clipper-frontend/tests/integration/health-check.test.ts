/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

describe("Health Check Route - Integration Tests", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

  // Postgres é a única dependência dura garantida em TODOS os ambientes
  // onde esta suíte roda hoje: CI (serviço docker real), `npm run
  // test:everything` (docker-compose local) e dev manual (Postgres local).
  // S3/Stripe/Redis não têm essa garantia (CI usa credenciais fake de
  // propósito — ver `.github/workflows/ci.yml`), então o probe continua
  // sempre 200 independente delas.
  it("deve responder com status 200 em GET /api/health (Postgres saudável neste ambiente de teste)", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
  });

  it("deve retornar { status, checks } com o resultado individual de cada dependência", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(data.status);

    expect(data).toHaveProperty("checks");
    expect(data.checks).toHaveProperty("postgres");
    expect(data.checks).toHaveProperty("s3");
    expect(data.checks).toHaveProperty("stripe");
    expect(data.checks).toHaveProperty("redis");

    // Postgres: dependência dura, sempre real nestes ambientes de teste.
    expect(data.checks.postgres.status).toBe("ok");

    // S3/Stripe: credenciais podem ser fake (CI) ou reais (dev/MinIO local)
    // dependendo de onde a suíte roda — só garantimos o formato do status.
    expect(["ok", "error"]).toContain(data.checks.s3.status);
    expect(["ok", "error"]).toContain(data.checks.stripe.status);

    // Redis/Upstash é opcional — "skipped" quando não configurado.
    expect(["ok", "error", "skipped"]).toContain(data.checks.redis.status);
  });

  it("deve retornar Content-Type application/json", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("deve ser capaz de ser chamado múltiplas vezes sem erro", async () => {
    const results = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/health`),
    ]);

    for (const res of results) {
      expect(res.status).toBe(200);
    }
  });
});
