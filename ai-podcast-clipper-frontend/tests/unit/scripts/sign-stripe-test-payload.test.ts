/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { signStripeTestPayload } from "../../../scripts/sign-stripe-test-payload.js";

/**
 * RNF-SEC-10: a assinatura de payloads de teste do webhook Stripe (usada no
 * cenário `falha_webhook_stripe` do experimento de observabilidade) saiu do
 * app (rota `/api/dev-sign-stripe-payload`, removida) para um script local
 * offline que usa a função oficial `stripe.webhooks.generateTestHeaderString`.
 */
describe("scripts/sign-stripe-test-payload.js", () => {
  const stripe = new Stripe("sk_test_mock", { apiVersion: "2025-04-30.basil" });
  const secret = "whsec_unit_test";
  const body = JSON.stringify({
    id: "evt_unit",
    object: "event",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_x", object: "subscription", customer: "cus_x" } },
  });

  it("gera um header Stripe-Signature aceito por stripe.webhooks.constructEvent", () => {
    const result = signStripeTestPayload({
      payload: body,
      webhookSecret: secret,
      stripeSecretKey: "sk_test_abc",
    });

    expect(result.header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    const event = stripe.webhooks.constructEvent(body, result.header, secret);
    expect(event.id).toBe("evt_unit");
  });

  it("header assinado com outro segredo é rejeitado pelo constructEvent", () => {
    const result = signStripeTestPayload({
      payload: body,
      webhookSecret: "whsec_outro",
      stripeSecretKey: "sk_test_abc",
    });
    expect(() => stripe.webhooks.constructEvent(body, result.header, secret)).toThrow();
  });

  it("reporta stripeSecretKeyMode 'test' só para chaves sk_test_", () => {
    expect(
      signStripeTestPayload({ payload: body, webhookSecret: secret, stripeSecretKey: "sk_test_abc" })
        .stripeSecretKeyMode,
    ).toBe("test");
    expect(
      signStripeTestPayload({ payload: body, webhookSecret: secret, stripeSecretKey: "sk_live_abc" })
        .stripeSecretKeyMode,
    ).toBe("NOT_TEST_MODE_CHECK_MANUALLY");
    expect(
      signStripeTestPayload({ payload: body, webhookSecret: secret, stripeSecretKey: undefined })
        .stripeSecretKeyMode,
    ).toBe("NOT_TEST_MODE_CHECK_MANUALLY");
  });

  it("falha explicitamente quando o STRIPE_WEBHOOK_SECRET está ausente", () => {
    expect(() =>
      signStripeTestPayload({ payload: body, webhookSecret: undefined, stripeSecretKey: "sk_test_abc" }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("nunca inclui o segredo na saída", () => {
    const result = signStripeTestPayload({
      payload: body,
      webhookSecret: secret,
      stripeSecretKey: "sk_test_abc",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("sk_test_abc");
  });
});

describe("RNF-SEC-10: rota de debug removida do código-fonte", () => {
  it("não existe mais nenhum route handler em src/app/api/dev-sign-stripe-payload/", () => {
    for (const ext of ["ts", "tsx", "js", "mjs"]) {
      const routeFile = fileURLToPath(
        new URL(`../../../src/app/api/dev-sign-stripe-payload/route.${ext}`, import.meta.url),
      );
      expect(existsSync(routeFile), routeFile).toBe(false);
    }
  });
});
