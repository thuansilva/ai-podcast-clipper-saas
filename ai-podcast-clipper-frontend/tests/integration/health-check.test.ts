/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

describe("Health Check Route - Integration Tests", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

  it("deve responder com status 200 em GET /api/health", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
  });

  it("deve retornar um objeto JSON com status 'ok'", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
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
