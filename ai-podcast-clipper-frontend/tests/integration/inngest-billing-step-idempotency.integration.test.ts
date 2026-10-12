/**
 * @vitest-environment node
 *
 * Teste de integração (Postgres real): confirma que `processStripeWebhook`
 * e `processSubscriptionEvent` envolvem seus use cases em `step.run(...)`
 * nomeados, o que faz o Inngest memoizar o passo já concluído entre
 * tentativas — sem isso, um retry (dentro do orçamento de `retries: 3`)
 * reexecuta a função inteira e duplica a linha em `CreditTransaction`
 * (item HIGH do checklist de go-live: "Sem idempotência contra retries
 * Inngest").
 *
 * Como o SDK do Inngest não expõe um harness de teste para simular
 * retries reais contra o motor de memoização, o cenário é reproduzido
 * usando o mesmo objeto `step` (que representa a memória de um único run)
 * entre duas invocações do handler exportado — exatamente como o Inngest
 * reaproveita a memória do run entre a tentativa original e o retry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "~/server/db";
import {
  processStripeWebhook,
  processSubscriptionEvent,
  type PipelineStep,
} from "~/inngest/functions";
import { env } from "~/env";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

function createMemoizingStep(): PipelineStep {
  const cache = new Map<string, unknown>();
  return {
    run: vi.fn(async (name: string, fn: () => unknown) => {
      if (cache.has(name)) {
        return cache.get(name);
      }
      const result = await fn();
      cache.set(name, result);
      return result;
    }) as unknown as PipelineStep["run"],
  };
}

describe("Inngest billing functions - step.run idempotency (Postgres real)", () => {
  useRollbackTransactionPerTest();

  async function createTestUser(stripeCustomerId: string) {
    return db.user.create({
      data: {
        id: `user_step_idem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `step-idem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId,
        credits: 0,
        subscriptionCredits: 0,
        oneTimeCredits: 0,
        plan: "STARTER",
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processSubscriptionEvent: um retry (mesmo step, 2ª invocação da função) não duplica CreditTransaction de checkout", async () => {
    const stripeCustomerId = `cus_step_idem_checkout_${Date.now()}`;
    const user = await createTestUser(stripeCustomerId);

    const step = createMemoizingStep();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;

    const eventPayload = {
      event: {
        name: "stripe/subscription.event",
        data: {
          eventType: "checkout.session.completed",
          customerId: stripeCustomerId,
          subscriptionId: `sub_step_idem_${Date.now()}`,
          priceId: env.STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY,
        },
      },
      step,
    };

    // 1ª execução: processa o checkout normalmente.
    await fn(eventPayload);

    const txsAfterFirst = await db.creditTransaction.findMany({
      where: { userId: user.id },
    });
    expect(txsAfterFirst).toHaveLength(1);

    // "Retry" do Inngest: a função roda de novo do zero, mas reaproveita o
    // mesmo `step` (memória do run) — o passo "apply-subscription-checkout"
    // já está memoizado e não deve chamar o use case de novo.
    await fn(eventPayload);

    const txsAfterRetry = await db.creditTransaction.findMany({
      where: { userId: user.id },
    });
    expect(txsAfterRetry).toHaveLength(1);

    const subscriptions = await db.subscription.findMany({
      where: { userId: user.id },
    });
    expect(subscriptions).toHaveLength(1);
  });

  it("processSubscriptionEvent: um retry de invoice.payment_succeeded não duplica CreditTransaction de renovação", async () => {
    const stripeCustomerId = `cus_step_idem_renewal_${Date.now()}`;
    const user = await createTestUser(stripeCustomerId);
    const stripeSubscriptionId = `sub_step_idem_renewal_${Date.now()}`;

    await db.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId,
        stripePriceId: env.STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY,
        plan: "STARTER",
        monthlyCredits: 150,
        status: "active",
        currentPeriodStart: new Date("2026-08-01"),
        currentPeriodEnd: new Date("2026-09-01"),
        cancelAtPeriodEnd: false,
      },
    });

    const step = createMemoizingStep();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;

    const eventPayload = {
      event: {
        name: "stripe/invoice.payment_succeeded",
        data: {
          eventType: "invoice.payment_succeeded",
          customerId: stripeCustomerId,
          subscriptionId: stripeSubscriptionId,
          billingReason: "subscription_cycle",
          currentPeriodStart: new Date("2026-09-01"),
          currentPeriodEnd: new Date("2026-10-01"),
        },
      },
      step,
    };

    await fn(eventPayload);
    const txsAfterFirst = await db.creditTransaction.findMany({
      where: { userId: user.id, type: "SUBSCRIPTION_RENEWAL" },
    });
    expect(txsAfterFirst).toHaveLength(1);

    // Retry: mesma memória de step, a função inteira roda de novo.
    await fn(eventPayload);
    const txsAfterRetry = await db.creditTransaction.findMany({
      where: { userId: user.id, type: "SUBSCRIPTION_RENEWAL" },
    });
    expect(txsAfterRetry).toHaveLength(1);
  });

  it("processStripeWebhook: o passo fica memoizado e não rechama o use case num retry (mesmo step)", async () => {
    // NOTA: `AddCreditsFromStripeWebhookUseCase` é um use case legado
    // (pacotes avulsos de créditos foram descontinuados — ver
    // `add-credits-from-stripe.use-case.ts`) que hoje não cria
    // `CreditTransaction` nem muda saldo, só valida que o `stripeCustomerId`
    // existe. Por isso a asserção aqui é sobre o `step.run` em si (contrato
    // de memoização), não sobre uma linha duplicada em `CreditTransaction`
    // — ver `tests/unit/inngest/subscription-inngest.test.ts` para a
    // asserção de que o use case mockado não é rechamado num retry.
    const stripeCustomerId = `cus_step_idem_onetime_${Date.now()}`;
    await createTestUser(stripeCustomerId);

    const step = createMemoizingStep();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processStripeWebhook as any).fn;

    const eventPayload = {
      event: {
        name: "stripe/checkout.completed",
        data: {
          customerId: stripeCustomerId,
          priceId: env.STRIPE_SMALL_CREDIT_PACK,
        },
      },
      step,
    };

    await fn(eventPayload);
    await fn(eventPayload);

    // O passo "add-credits-from-stripe-checkout" só deve ter sido executado
    // (callback invocado) na 1ª chamada — na 2ª (retry simulado), o mesmo
    // `step` já tem o resultado em cache.
    expect(step.run).toHaveBeenCalledTimes(2);
    expect(step.run).toHaveBeenNthCalledWith(
      1,
      "add-credits-from-stripe-checkout",
      expect.any(Function)
    );
    expect(step.run).toHaveBeenNthCalledWith(
      2,
      "add-credits-from-stripe-checkout",
      expect.any(Function)
    );
  });
});
