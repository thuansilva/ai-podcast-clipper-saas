/**
 * @vitest-environment node
 *
 * Testes de integração: exercita a Server Action real (`~/actions/stripe`),
 * passando pelo schema real de borda e pelo repositório real de usuário
 * (Prisma, banco de testes via docker-compose), com o rate limiter real (não
 * mockado). Apenas o SDK do Stripe e o redirect do Next são mockados.
 *
 * Objetivo: comprovar que, acima do limite, createCheckoutSession retorna
 * erro de rate limit ANTES de jamais chamar a API do Stripe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../../helpers/with-rollback-transaction";

const mockCheckoutCreate = vi.fn();

vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: { create: (...args: unknown[]) => mockCheckoutCreate(...args) },
    };
  },
}));

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe("createCheckoutSession - Integração (rate limiter real + Prisma real + Stripe mockado)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_stripe_rl_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const stripeCustomerId = `cus_rl_it_${Date.now()}`;

  beforeEach(async () => {
    mockGetUserId.mockResolvedValue(userId);
    mockCheckoutCreate.mockResolvedValue({ url: "https://stripe.com/pay/cs_rl_it" });
    await db.user.create({
      data: {
        id: userId,
        email: `stripe-rl-it-${Date.now()}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId,
      },
    });
  });

  afterEach(() => {
    mockCheckoutCreate.mockReset();
    mockRedirect.mockClear();
    mockGetUserId.mockReset();
  });

  it("bloqueia a 6a sessão de checkout no mesmo minuto sem jamais chamar o Stripe", async () => {
    const { createCheckoutSession } = await import("~/actions/stripe");

    for (let i = 0; i < 5; i++) {
      await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
        "NEXT_REDIRECT:"
      );
    }
    expect(mockCheckoutCreate).toHaveBeenCalledTimes(5);

    await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
      "Too many requests"
    );
    expect(mockCheckoutCreate).toHaveBeenCalledTimes(5);
  });
});
