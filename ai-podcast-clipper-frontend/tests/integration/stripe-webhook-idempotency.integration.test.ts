/**
 * @vitest-environment node
 *
 * Testes de integração: idempotência de webhooks do Stripe
 * com banco Postgres real.
 *
 * Garante que o evento só é marcado como processado DEPOIS de confirmar
 * que o dispatch pro Inngest foi bem-sucedido, e que retries do Stripe
 * (mesmo event.id) são idempotentes.
 */

import { describe, it, expect, vi } from "vitest";
import { db } from "~/server/db";
import Stripe from "stripe";
import { POST } from "~/app/api/webhooks/stripe/route";
import { inngest } from "~/inngest/client";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

// Mock do inngest para simular falhas e sucesso
vi.mock("~/inngest/client");

const mockInngestSend = vi.fn();
(inngest as any).send = mockInngestSend;

describe("Stripe Webhook Idempotency - Integration Tests", () => {
  useRollbackTransactionPerTest();

  const stripe = new Stripe("sk_test_mock", {
    apiVersion: "2025-04-30.basil",
  });
  const STRIPE_WEBHOOK_SECRET = "whsec_mock";

  async function createTestUser(stripeCustomerId: string) {
    const user = await db.user.create({
      data: {
        id: `user_stripe_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `stripe-webhook-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId,
        credits: 0,
        plan: "STARTER",
      },
    });
    return user;
  }

  function createStripeEvent(
    eventType: string,
    eventId: string,
    customerId: string,
    subscriptionId: string
  ): Stripe.Event {
    const baseEvent: Stripe.Event = {
      id: eventId,
      object: "event",
      api_version: "2025-04-30.basil",
      created: Math.floor(Date.now() / 1000),
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture populated below per event type
        object: {} as any,
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: null,
        idempotency_key: null,
      },
      type: eventType as any,
    };

    if (eventType === "checkout.session.completed") {
      baseEvent.data.object = {
        id: "cs_test_checkout",
        customer: customerId,
        subscription: subscriptionId,
        mode: "subscription",
        line_items: {
          object: "list",
          data: [
            {
              price: {
                id: "price_starter_monthly_mock",
              },
            },
          ],
        },
      } as any;
    } else if (eventType === "invoice.payment_succeeded") {
      baseEvent.data.object = {
        id: "in_test_invoice",
        customer: customerId,
        subscription: subscriptionId,
        billing_reason: "subscription_cycle",
        lines: {
          data: [
            {
              price: {
                id: "price_starter_monthly_mock",
              },
              period: {
                start: Math.floor(Date.now() / 1000),
                end: Math.floor(Date.now() / 1000) + 86400 * 30,
              },
            },
          ],
        },
      } as any;
    }

    return baseEvent;
  }

  function createMockRequest(event: Stripe.Event): Request {
    const body = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      secret: STRIPE_WEBHOOK_SECRET,
      payload: body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    return new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body,
    });
  }

  describe("Cenário 1: Falha no dispatch → evento NÃO deve ser marcado", () => {
    it("Se inngest.send falha, evento NÃO deve estar marcado no banco e resposta deve ser 5xx", async () => {
      const customerId = `cus_dispatch_fail_${Date.now()}`;
      const subscriptionId = `sub_dispatch_fail_${Date.now()}`;
      const eventId = `evt_dispatch_fail_${Date.now()}`;
      const user = await createTestUser(customerId);

      const event = createStripeEvent(
        "checkout.session.completed",
        eventId,
        customerId,
        subscriptionId
      );
      const request = createMockRequest(event);

      // Mock: inngest.send FALHA
      mockInngestSend.mockRejectedValueOnce(
        new Error("Network timeout")
      );

      const response = await POST(request.clone());

      // Asserção 1: Resposta deve ser 5xx (não 200)
      expect(response.status).toBeGreaterThanOrEqual(500);

      // Asserção 2: Evento NÃO deve estar marcado como processado
      const processedEvent = await db.processedWebhookEvent.findUnique({
        where: {
          stripeEventId: eventId,
        },
      });
      expect(processedEvent).toBeNull();
    });
  });

  describe("Cenário 2: Retry após falha anterior → deve processar normalmente", () => {
    it("Primeira tentativa falha (evento NÃO marcado) → Retry sucede (evento marcado, inngest.send chamado novamente)", async () => {
      const customerId = `cus_retry_after_fail_${Date.now()}`;
      const subscriptionId = `sub_retry_after_fail_${Date.now()}`;
      const eventId = `evt_retry_after_fail_${Date.now()}`;
      const user = await createTestUser(customerId);

      const event = createStripeEvent(
        "invoice.payment_succeeded",
        eventId,
        customerId,
        subscriptionId
      );
      const request = createMockRequest(event);

      // Primeira tentativa: inngest.send FALHA
      mockInngestSend.mockRejectedValueOnce(
        new Error("Service unavailable")
      );

      const response1 = await POST(request.clone());

      // Evento NÃO deve estar marcado após falha
      expect(response1.status).toBeGreaterThanOrEqual(500);
      const processedEvent1 = await db.processedWebhookEvent.findUnique({
        where: {
          stripeEventId: eventId,
        },
      });
      expect(processedEvent1).toBeNull();

      // Retry: Stripe reenvia com o mesmo event.id
      // Desta vez inngest.send SUCEDE
      mockInngestSend.mockResolvedValueOnce({} as any);

      const response2 = await POST(request.clone());

      // Resposta do retry deve ser 200 OK
      expect(response2.status).toBe(200);

      // Evento DEVE estar marcado após sucesso no retry
      const processedEvent2 = await db.processedWebhookEvent.findUnique({
        where: {
          stripeEventId: eventId,
        },
      });
      expect(processedEvent2).toBeTruthy();

      // inngest.send DEVE ter sido chamado 2 vezes (uma falha, uma sucesso)
      expect(mockInngestSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("Cenário 3: Idempotência em caso de sucesso anterior (regressão)", () => {
    it("Retry após sucesso anterior é ignorado (inngest.send chamado 1 vez, não 2)", async () => {
      const customerId = `cus_idempotent_${Date.now()}`;
      const subscriptionId = `sub_idempotent_${Date.now()}`;
      const eventId = `evt_idempotent_${Date.now()}`;
      const user = await createTestUser(customerId);

      const event = createStripeEvent(
        "checkout.session.completed",
        eventId,
        customerId,
        subscriptionId
      );
      const request = createMockRequest(event);

      // Primeira tentativa: sucesso
      mockInngestSend.mockResolvedValueOnce({} as any);
      const response1 = await POST(request.clone());
      expect(response1.status).toBe(200);

      // Evento está marcado
      const processedEvent1 = await db.processedWebhookEvent.findUnique({
        where: {
          stripeEventId: eventId,
        },
      });
      expect(processedEvent1).toBeTruthy();

      // Retry: mesmo event.id
      mockInngestSend.mockResolvedValueOnce({} as any);
      const response2 = await POST(request.clone());
      expect(response2.status).toBe(200);

      // inngest.send deve ter sido chamado apenas 1 vez (idempotência)
      expect(mockInngestSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cenário 4: event.id do Stripe passa como idempotencyKey ao Inngest", () => {
    it("event.id é passado como 'id' ao inngest.send()", async () => {
      const customerId = `cus_idempotency_key_${Date.now()}`;
      const subscriptionId = `sub_idempotency_key_${Date.now()}`;
      const eventId = `evt_idempotency_key_${Date.now()}`;
      const user = await createTestUser(customerId);

      const event = createStripeEvent(
        "checkout.session.completed",
        eventId,
        customerId,
        subscriptionId
      );
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);

      await POST(request.clone());

      // Verificar que inngest.send foi chamado
      expect(mockInngestSend).toHaveBeenCalled();

      // Obter o argumento da chamada
      const callArgs = mockInngestSend.mock.calls[0]!;
      const eventPayload = callArgs[0];

      // event.id deve estar em 'id' do payload
      expect(eventPayload.id).toBe(eventId);
    });
  });
});
