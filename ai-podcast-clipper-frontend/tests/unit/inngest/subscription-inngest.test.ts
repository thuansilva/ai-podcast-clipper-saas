import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processSubscriptionEvent,
  processStripeWebhook,
  type PipelineStep,
} from "~/inngest/functions";

const mockRenewalExecute = vi.fn();
const mockExpireExecute = vi.fn();
const mockCheckoutExecute = vi.fn();
const mockSubUpdate = vi.fn();
const mockAddCreditsFromStripeExecute = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeHoldCreditsUseCase: vi.fn(),
  makeConsumeCreditsUseCase: vi.fn(),
  makeRefundCreditsUseCase: vi.fn(),
  makeAddCreditsFromStripeWebhookUseCase: () => ({
    execute: mockAddCreditsFromStripeExecute,
  }),
  makeProcessSubscriptionRenewalUseCase: () => ({
    execute: mockRenewalExecute,
  }),
  makeExpireSubscriptionUseCase: () => ({
    execute: mockExpireExecute,
  }),
  makeProcessSubscriptionCheckoutUseCase: () => ({
    execute: mockCheckoutExecute,
  }),
}));

vi.mock(
  "~/infrastructure/database/repositories/prisma-subscription.repository",
  () => ({
    PrismaSubscriptionRepository: class {
      update = mockSubUpdate;
    },
  })
);

/**
 * Mock de `step` que: (1) executa o callback imediatamente, como os demais
 * testes de `processVideoHandler` já fazem (ver
 * `tests/unit/inngest/manual-cuts-pipeline.test.ts`); e (2) grava o nome de
 * cada passo chamado, para as asserções abaixo confirmarem que os use cases
 * de billing estão protegidos por `step.run` (regressão do item HIGH "Sem
 * idempotência contra retries Inngest" do checklist de go-live) — sem isso,
 * um retry do Inngest reexecuta a função inteira e duplica a
 * `CreditTransaction`, já que `step.run` é o único jeito do Inngest
 * memoizar um passo já concluído entre tentativas.
 */
function createMockStep(): PipelineStep {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => await fn()),
  } as unknown as PipelineStep;
}

describe("Inngest processSubscriptionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve registrar os triggers esperados para eventos de assinatura", () => {
    const fnId =
      typeof processSubscriptionEvent.id === "function"
        ? (processSubscriptionEvent as any).id()
        : processSubscriptionEvent.id;
    expect(fnId).toBe("process-subscription-event");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const triggers = (processSubscriptionEvent as any).opts.triggers;
    const eventNames = triggers.map((t: { event: string }) => t.event);
    expect(eventNames).toContain("stripe/subscription.event");
    expect(eventNames).toContain("stripe/invoice.payment_succeeded");
    expect(eventNames).toContain("stripe/customer.subscription.updated");
    expect(eventNames).toContain("stripe/customer.subscription.deleted");
  });

  it("deve processar evento checkout.session.completed dentro de um step.run (idempotência contra retries)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    const step = createMockStep();
    await fn({
      event: {
        name: "stripe/subscription.event",
        data: {
          eventType: "checkout.session.completed",
          customerId: "cus_123",
          subscriptionId: "sub_123",
          priceId: "price_creator",
        },
      },
      step,
    });

    expect(mockCheckoutExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_creator",
      })
    );
    // RNF: o use case precisa estar dentro de um step.run nomeado, senão um
    // retry do Inngest reexecuta a função inteira e duplica a
    // CreditTransaction (SET de subscriptionCredits não duplica saldo, mas
    // o histórico de transações sim).
    expect(step.run).toHaveBeenCalledWith(
      "apply-subscription-checkout",
      expect.any(Function)
    );
  });

  it("deve processar evento invoice.payment_succeeded dentro de um step.run (idempotência contra retries)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    const step = createMockStep();
    await fn({
      event: {
        name: "stripe/invoice.payment_succeeded",
        data: {
          customerId: "cus_456",
          subscriptionId: "sub_456",
        },
      },
      step,
    });

    expect(mockRenewalExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_456",
        stripeSubscriptionId: "sub_456",
      })
    );
    expect(step.run).toHaveBeenCalledWith(
      "apply-subscription-renewal",
      expect.any(Function)
    );
  });

  it("deve processar evento customer.subscription.deleted dentro de um step.run (idempotência contra retries)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    const step = createMockStep();
    await fn({
      event: {
        name: "stripe/customer.subscription.deleted",
        data: {
          customerId: "cus_789",
          subscriptionId: "sub_789",
        },
      },
      step,
    });

    expect(mockExpireExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_789",
        stripeSubscriptionId: "sub_789",
      })
    );
    expect(step.run).toHaveBeenCalledWith(
      "expire-subscription",
      expect.any(Function)
    );
  });

  it("deve processar evento customer.subscription.updated dentro de um step.run (idempotência contra retries)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    const step = createMockStep();
    await fn({
      event: {
        name: "stripe/customer.subscription.updated",
        data: {
          customerId: "cus_update",
          subscriptionId: "sub_update",
          status: "past_due",
          cancelAtPeriodEnd: true,
        },
      },
      step,
    });

    expect(mockSubUpdate).toHaveBeenCalledWith("sub_update", {
      status: "past_due",
      cancelAtPeriodEnd: true,
    });
    expect(step.run).toHaveBeenCalledWith(
      "update-subscription-status",
      expect.any(Function)
    );
  });

  it("não deve rechamar o use case de checkout quando o step já estiver memoizado (simulação de retry do Inngest)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;

    // Simula o comportamento real do Inngest: o mesmo `step` (memória do
    // run) é reaproveitado entre a execução original e o retry. Um passo já
    // concluído deve devolver o resultado em cache SEM chamar `fn` de novo.
    const cache = new Map<string, unknown>();
    const memoizingStep: PipelineStep = {
      run: vi.fn(async (name: string, runFn: () => unknown) => {
        if (cache.has(name)) {
          return cache.get(name);
        }
        const result = await runFn();
        cache.set(name, result);
        return result;
      }) as unknown as PipelineStep["run"],
    };

    const eventPayload = {
      event: {
        name: "stripe/subscription.event",
        data: {
          eventType: "checkout.session.completed",
          customerId: "cus_retry",
          subscriptionId: "sub_retry",
          priceId: "price_creator",
        },
      },
      step: memoizingStep,
    };

    // 1ª execução: sucede e popula a memória do step.
    await fn(eventPayload);
    // "Retry" do Inngest: a função roda de novo do zero, mas o step
    // (memória do run) já tem o passo concluído.
    await fn(eventPayload);

    expect(mockCheckoutExecute).toHaveBeenCalledTimes(1);
  });
});

describe("Inngest processStripeWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve chamar AddCreditsFromStripeWebhookUseCase dentro de um step.run nomeado (idempotência contra retries)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processStripeWebhook as any).fn;
    const step = createMockStep();

    await fn({
      event: {
        name: "stripe/checkout.completed",
        data: {
          customerId: "cus_one_time",
          priceId: "price_small_pack",
        },
      },
      step,
    });

    expect(mockAddCreditsFromStripeExecute).toHaveBeenCalledWith({
      stripeCustomerId: "cus_one_time",
      priceId: "price_small_pack",
    });
    expect(step.run).toHaveBeenCalledWith(
      "add-credits-from-stripe-checkout",
      expect.any(Function)
    );
  });

  it("não deve rechamar o use case quando o step já estiver memoizado (simulação de retry do Inngest)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processStripeWebhook as any).fn;

    const cache = new Map<string, unknown>();
    const memoizingStep: PipelineStep = {
      run: vi.fn(async (name: string, runFn: () => unknown) => {
        if (cache.has(name)) {
          return cache.get(name);
        }
        const result = await runFn();
        cache.set(name, result);
        return result;
      }) as unknown as PipelineStep["run"],
    };

    const eventPayload = {
      event: {
        name: "stripe/checkout.completed",
        data: {
          customerId: "cus_retry_one_time",
          priceId: "price_small_pack",
        },
      },
      step: memoizingStep,
    };

    await fn(eventPayload);
    await fn(eventPayload);

    expect(mockAddCreditsFromStripeExecute).toHaveBeenCalledTimes(1);
  });
});
