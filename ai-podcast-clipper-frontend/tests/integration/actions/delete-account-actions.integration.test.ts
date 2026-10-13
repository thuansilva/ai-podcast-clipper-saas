/**
 * @vitest-environment node
 *
 * Testes de integração: exercitam a Server Action real
 * (`~/actions/delete-account::requestAccountDeletion`), passando pelo
 * `CancelUserSubscriptionUseCase` real (via
 * `makeCancelUserSubscriptionUseCase`) e pelo repositório real de
 * assinatura/usuário (Prisma, banco de testes via docker-compose). Apenas o
 * SDK do Stripe e o `IAuthGateway` (Clerk) são mockados — nunca chamamos a
 * API real do Stripe/Clerk em teste, mesmo padrão de
 * `tests/integration/actions/stripe-actions.integration.test.ts`.
 *
 * Objetivo: comprovar a correção central desta tarefa — o cancelamento da
 * assinatura Stripe precisa ser confirmado de forma síncrona ANTES de
 * `IAuthGateway.deleteUser` ser chamado, para que o usuário nunca ache que
 * cancelou e continue sendo cobrado por causa de um webhook atrasado/perdido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../../helpers/with-rollback-transaction";

const mockSubscriptionsCancel = vi.fn();

vi.mock("stripe", () => {
  class MockStripeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  class MockStripe {
    subscriptions = {
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    };
  }

  (MockStripe as unknown as { errors: unknown }).errors = {
    StripeError: MockStripeError,
  };

  return { default: MockStripe };
});

const mockRequireUserId = vi.fn();
const mockDeleteUser = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({
    requireUserId: mockRequireUserId,
    deleteUser: mockDeleteUser,
  }),
}));

describe("requestAccountDeletion - Integração (Prisma real + Stripe/Clerk mockados)", () => {
  useRollbackTransactionPerTest();

  function uniqueId(label: string): string {
    return `user_delete_action_it_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  afterEach(() => {
    mockSubscriptionsCancel.mockReset();
    mockRequireUserId.mockReset();
    mockDeleteUser.mockReset();
  });

  it("cancela a assinatura ativa no Stripe (persistindo 'canceled' no banco) ANTES de pedir ao Clerk para deletar o usuário", async () => {
    const userId = uniqueId("active_sub");
    mockRequireUserId.mockResolvedValue(userId);

    await db.user.create({
      data: {
        id: userId,
        email: `real-${userId}@example.com`,
        password: "hashedpassword123",
        credits: 130,
        subscriptionCredits: 80,
        oneTimeCredits: 50,
        plan: "PRO",
        stripeCustomerId: `cus_${userId}`,
      },
    });

    await db.subscription.create({
      data: {
        userId,
        stripeSubscriptionId: `sub_${userId}`,
        stripePriceId: "price_pro_monthly_test",
        status: "active",
        plan: "PRO",
        monthlyCredits: 300,
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    });

    const { requestAccountDeletion } = await import("~/actions/delete-account");

    const callOrder: string[] = [];
    mockSubscriptionsCancel.mockImplementationOnce(async () => {
      callOrder.push("stripe.cancelSubscription");
      return {};
    });
    mockDeleteUser.mockImplementationOnce(async () => {
      callOrder.push("clerk.deleteUser");
    });

    await expect(requestAccountDeletion()).resolves.toBeUndefined();

    expect(mockSubscriptionsCancel).toHaveBeenCalledWith(`sub_${userId}`);
    expect(mockDeleteUser).toHaveBeenCalledWith(userId);
    expect(callOrder).toEqual(["stripe.cancelSubscription", "clerk.deleteUser"]);

    const persistedSubscription = await db.subscription.findUnique({
      where: { userId },
    });
    expect(persistedSubscription?.status).toBe("canceled");

    const persistedUser = await db.user.findUnique({ where: { id: userId } });
    expect(persistedUser?.plan).toBe("STARTER");
  });

  it("sem assinatura: não chama o Stripe e ainda assim pede ao Clerk para deletar o usuário", async () => {
    const userId = uniqueId("no_sub");
    mockRequireUserId.mockResolvedValue(userId);
    mockDeleteUser.mockResolvedValueOnce(undefined);

    await db.user.create({
      data: {
        id: userId,
        email: `real-${userId}@example.com`,
        password: "hashedpassword123",
        credits: 10,
        plan: "STARTER",
      },
    });

    const { requestAccountDeletion } = await import("~/actions/delete-account");

    await expect(requestAccountDeletion()).resolves.toBeUndefined();

    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith(userId);
  });

  it("se a Stripe falhar ao cancelar, propaga o erro e NUNCA chama deleteUser (o usuário não é deletado no Clerk)", async () => {
    const userId = uniqueId("stripe_failure");
    mockRequireUserId.mockResolvedValue(userId);
    mockSubscriptionsCancel.mockRejectedValueOnce(
      new Error("Stripe indisponível")
    );

    await db.user.create({
      data: {
        id: userId,
        email: `real-${userId}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        subscriptionCredits: 80,
        oneTimeCredits: 20,
        plan: "PRO",
        stripeCustomerId: `cus_${userId}`,
      },
    });

    await db.subscription.create({
      data: {
        userId,
        stripeSubscriptionId: `sub_${userId}`,
        stripePriceId: "price_pro_monthly_test",
        status: "active",
        plan: "PRO",
        monthlyCredits: 300,
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    });

    const { requestAccountDeletion } = await import("~/actions/delete-account");

    await expect(requestAccountDeletion()).rejects.toThrow(
      "Stripe indisponível"
    );

    expect(mockDeleteUser).not.toHaveBeenCalled();

    const persistedSubscription = await db.subscription.findUnique({
      where: { userId },
    });
    expect(persistedSubscription?.status).toBe("active");

    const persistedUser = await db.user.findUnique({ where: { id: userId } });
    expect(persistedUser?.plan).toBe("PRO");
  });
});
