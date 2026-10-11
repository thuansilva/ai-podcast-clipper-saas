/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * RNF-IDEM-05: a fila em memória do `StripeBackgroundQueue` só existe como
 * conveniência de dev local (sem Inngest Cloud/dev server). Ela não
 * sobrevive a cold start/restart de instância serverless — em produção, se
 * `INNGEST_EVENT_KEY` faltar por engano, cair nela faria o webhook do
 * Stripe responder 200 (evento marcado como processado) enquanto o crédito
 * pago pode se perder silenciosamente. Em `NODE_ENV=production` sem a key,
 * `enqueue`/`enqueueSubscription` devem LANÇAR (a rota responde 503 e o
 * Stripe reentrega), nunca empurrar pra fila em memória.
 */

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("~/inngest/client", () => ({
  inngest: { send: sendMock },
}));

// Os workers da fila em memória chamariam use cases reais (Prisma). Aqui só
// interessa se o payload entrou ou não na fila — os use cases viram no-op.
vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeAddCreditsFromStripeWebhookUseCase: () => ({ execute: vi.fn() }),
  makeProcessSubscriptionCheckoutUseCase: () => ({ execute: vi.fn() }),
  makeProcessSubscriptionRenewalUseCase: () => ({ execute: vi.fn() }),
  makeExpireSubscriptionUseCase: () => ({ execute: vi.fn() }),
}));

vi.mock(
  "~/infrastructure/database/repositories/prisma-subscription.repository",
  () => ({
    PrismaSubscriptionRepository: class {
      update = vi.fn();
    },
  })
);

import { StripeBackgroundQueue } from "~/infrastructure/queue/stripe-queue";

const checkoutPayload = { customerId: "cus_guard", priceId: "price_guard" };
const subscriptionPayload = {
  eventType: "checkout.session.completed" as const,
  customerId: "cus_guard",
  subscriptionId: "sub_guard",
  priceId: "price_guard",
};

describe("StripeBackgroundQueue - guard de produção da fila em memória", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ ids: ["evt"] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each([
    ["ausente (undefined)", undefined],
    ["vazia", ""],
  ])("NODE_ENV=production com INNGEST_EVENT_KEY %s", (_label, keyValue) => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("INNGEST_EVENT_KEY", keyValue);
    });

    it("enqueue lança erro explícito e NÃO empurra pra fila em memória", async () => {
      const queue = new StripeBackgroundQueue();

      await expect(queue.enqueue(checkoutPayload, "evt_1")).rejects.toThrow(
        /INNGEST_EVENT_KEY/
      );
      expect(queue.getPendingCount()).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("enqueueSubscription lança erro explícito e NÃO empurra pra fila em memória", async () => {
      const queue = new StripeBackgroundQueue();

      await expect(
        queue.enqueueSubscription(subscriptionPayload, "evt_2")
      ).rejects.toThrow(/INNGEST_EVENT_KEY/);
      expect(queue.getPendingCount()).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it("NODE_ENV=production COM INNGEST_EVENT_KEY despacha pro Inngest (sem fila em memória)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_EVENT_KEY", "evt_key_prod_mock");
    const queue = new StripeBackgroundQueue();

    await queue.enqueue(checkoutPayload, "evt_3");
    await queue.enqueueSubscription(subscriptionPayload, "evt_4");

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(queue.getPendingCount()).toBe(0);
  });

  it.each(["development", "test"])(
    "NODE_ENV=%s sem INNGEST_EVENT_KEY mantém o fallback em memória (dev local)",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("INNGEST_EVENT_KEY", undefined);
      const queue = new StripeBackgroundQueue();

      await expect(queue.enqueue(checkoutPayload)).resolves.toBeUndefined();
      await expect(
        queue.enqueueSubscription(subscriptionPayload)
      ).resolves.toBeUndefined();

      expect(sendMock).not.toHaveBeenCalled();
      // Os 2 payloads entraram na fila em memória (ainda em processamento
      // via setImmediate neste ponto).
      expect(queue.getPendingCount()).toBe(2);
    }
  );
});
