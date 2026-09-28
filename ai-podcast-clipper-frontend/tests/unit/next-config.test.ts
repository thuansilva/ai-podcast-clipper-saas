import { describe, it, expect, beforeAll } from "vitest";

let config: typeof import("../../next.config.js").default;

beforeAll(async () => {
  config = (await import("../../next.config.js")).default;
});

describe("next.config.js headers", () => {
  it("aplica cabeçalhos de segurança em todas as rotas", async () => {
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");

    const headerNames = rules[0]!.headers.map((h) => h.key);
    expect(headerNames).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Strict-Transport-Security",
      ])
    );
  });

  it("X-Content-Type-Options é nosniff", async () => {
    const rules = await config.headers!();
    const header = rules[0]!.headers.find((h) => h.key === "X-Content-Type-Options");
    expect(header?.value).toBe("nosniff");
  });

  it("X-Frame-Options impede embed cross-origin", async () => {
    const rules = await config.headers!();
    const header = rules[0]!.headers.find((h) => h.key === "X-Frame-Options");
    expect(header?.value).toBe("SAMEORIGIN");
  });
});
