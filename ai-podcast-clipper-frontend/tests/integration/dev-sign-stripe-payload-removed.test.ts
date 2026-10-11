/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

/**
 * Teste de integração HTTP real (mesmo padrão de
 * `tests/integration/health-check.test.ts`): exige um servidor Next.js de pé
 * em TEST_BASE_URL/localhost:3000.
 *
 * RNF-SEC-10: o endpoint de debug `/api/dev-sign-stripe-payload` assinava
 * payloads arbitrários com o STRIPE_WEBHOOK_SECRET real do ambiente e só era
 * bloqueado quando `NODE_ENV === "production"` — em preview/staging ele
 * permitia forjar webhooks Stripe válidos. Ele foi REMOVIDO; a rota não pode
 * mais existir em nenhum ambiente (a assinatura de payloads de teste do
 * experimento de observabilidade passou para
 * `scripts/sign-stripe-test-payload.js`, fora do app).
 */
describe("Endpoint de debug /api/dev-sign-stripe-payload removido - Integration Tests", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
  const path = "/api/dev-sign-stripe-payload";

  it("POST deve responder 404 (rota inexistente) e não devolver header assinado", async () => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      body: JSON.stringify({ id: "evt_forjado", type: "customer.subscription.deleted" }),
    });

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toMatch(/t=\d+,v1=[0-9a-f]{64}/);
    expect(text).not.toContain("stripeSecretKeyMode");
  });

  it("GET deve responder 404", async () => {
    const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
    expect(res.status).toBe(404);
  });
});
