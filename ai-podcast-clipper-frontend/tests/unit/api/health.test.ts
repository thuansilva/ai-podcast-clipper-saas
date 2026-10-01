import { describe, it, expect } from "vitest";
import { GET } from "~/app/api/health/route";

describe("Health Check Route - Unit Tests", () => {
  it("deve retornar status 200 ao chamar GET /api/health", async () => {
    const req = new Request("http://localhost:3000/api/health", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("deve retornar um objeto JSON com propriedade 'status'", async () => {
    const req = new Request("http://localhost:3000/api/health", {
      method: "GET",
    });

    const res = await GET(req);
    const data = await res.json();
    expect(data).toHaveProperty("status");
  });

  it("deve retornar 'ok' na propriedade 'status'", async () => {
    const req = new Request("http://localhost:3000/api/health", {
      method: "GET",
    });

    const res = await GET(req);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("deve retornar Content-Type application/json", async () => {
    const req = new Request("http://localhost:3000/api/health", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
