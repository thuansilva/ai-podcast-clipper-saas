/**
 * @vitest-environment node
 *
 * Integração: confirma, contra o servidor Next.js real (ver
 * `npm run test:everything` / CI, que buildam e sobem a app antes deste
 * step), que o header de CSP é enviado como `Content-Security-Policy-
 * Report-Only` — e explicitamente NÃO como `Content-Security-Policy`
 * (modo enforce). Este é o guard mais importante da tarefa RNF-SEC-09: só
 * reportar violações (sem bloquear nada) até alguém validar ao vivo login
 * Clerk e checkout/portal Stripe em staging (ver
 * docs/operacao/checklist-go-live.md).
 */
import { describe, it, expect } from "vitest";

describe("Security headers (CSP) - Integration Tests", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

  it("responde com Content-Security-Policy-Report-Only e não com Content-Security-Policy (enforce)", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "GET" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy-report-only")).toBeTruthy();
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("o valor do header Report-Only contém as diretivas mínimas de defesa", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "GET" });
    const csp = res.headers.get("content-security-policy-report-only");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("mantém os demais headers de segurança já existentes (não regride)", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "GET" });

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
