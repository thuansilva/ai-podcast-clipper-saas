/**
 * @vitest-environment node
 *
 * RNF-IDEM-05 — integração ponta a ponta do guard de produção da fila em
 * memória: rota real do webhook do Stripe (`POST /api/webhooks/stripe`,
 * assinatura HMAC real via `generateTestHeaderString`) + `StripeBackgroundQueue`
 * real (sem mock de `~/infrastructure/queue/stripe-queue`) + Postgres real.
 *
 * Com `NODE_ENV=production` e `INNGEST_EVENT_KEY` ausente, o evento NÃO pode
 * cair na fila em memória (não durável): a rota deve responder 5xx e o
 * evento NÃO pode ser marcado como processado — assim o Stripe reentrega
 * depois, em vez de o crédito pago se perder num cold start.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import Stripe from "stripe";
import { db } from "~/server/db";
import { POST } from "~/app/api/webhooks/stripe/route";
import { inngest } from "~/inngest/client";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

vi.mock("~/inngest/client");

const mockInngestSend = vi.fn();
(inngest as unknown as { send: typeof mockInngestSend }).send = mockInngestSend;

const STRIPE_WEBHOOK_SECRET = "whsec_mock"; // mesmo valor de tests/setup.ts
const stripe = new Stripe("sk_test_mock", { apiVersion: "2025-04-30.basil" });

function buildInvoicePaidEvent(
  eventId: string,
  customerId: string,
  subscriptionId: string
): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: eventId,
    object: "event",
    api_version: "2025-04-30.basil",
    created: now,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: `in_${eventId}`,
        customer: customerId,
        subscription: subscriptionId,
        billing_reason: "subscription_cycle",
        lines: {
          data: [
            {
              price: { id: "price_starter_monthly_mock" },
              period: { start: now, end: now + 86400 * 30 },
            },
          ],
        },
      },
    },
  } as unknown as Stripe.Event;
}

function signedWebhookRequest(event: Stripe.Event): Request {
  const body = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    secret: STRIPE_WEBHOOK_SECRET,
    payload: body,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body,
  });
}

describe("Webhook Stripe + StripeBackgroundQueue em produção sem INNGEST_EVENT_KEY (Integration)", () => {
  useRollbackTransactionPerTest();

  afterEach(() => {
    vi.unstubAllEnvs();
    mockInngestSend.mockReset();
  });

  it("responde 5xx e NÃO marca o evento como processado (Stripe reentrega)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_EVENT_KEY", "");

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const customerId = `cus_prod_guard_${suffix}`;
    const eventId = `evt_prod_guard_${suffix}`;
    await db.user.create({
      data: {
        id: `user_prod_guard_${suffix}`,
        email: `prod-guard-${suffix}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId: customerId,
        credits: 0,
        plan: "STARTER",
      },
    });

    const res = await POST(
      signedWebhookRequest(buildInvoicePaidEvent(eventId, customerId, `sub_prod_guard_${suffix}`))
    );

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(mockInngestSend).not.toHaveBeenCalled();
    const processed = await db.processedWebhookEvent.findUnique({
      where: { stripeEventId: eventId },
    });
    expect(processed).toBeNull();
  });

  it("controle: fora de produção (NODE_ENV=test) sem a key, o mesmo evento usa a fila em memória e é marcado (200)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("INNGEST_EVENT_KEY", "");

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const eventId = `evt_dev_fallback_${suffix}`;

    // Customer inexistente de propósito: o worker da fila em memória roda
    // depois (setImmediate) e só loga o erro do use case — aqui interessa
    // apenas a resposta síncrona da rota.
    const res = await POST(
      signedWebhookRequest(
        buildInvoicePaidEvent(eventId, `cus_dev_fallback_${suffix}`, `sub_dev_fallback_${suffix}`)
      )
    );

    expect(res.status).toBe(200);
    expect(mockInngestSend).not.toHaveBeenCalled();
    const processed = await db.processedWebhookEvent.findUnique({
      where: { stripeEventId: eventId },
    });
    expect(processed).not.toBeNull();
  });
});
