/**
 * @vitest-environment node
 *
 * Testes de integração: exercitam a Server Action real (`~/actions/stripe`),
 * passando pelo schema de borda real (`createCheckoutSessionSchema` /
 * `createCustomerPortalSessionSchema`) e pelo repositório real de usuário
 * (Prisma, banco de testes via docker-compose). Apenas o SDK do Stripe é
 * mockado — nunca chamamos a API real do Stripe em teste.
 *
 * Objetivo: comprovar que um payload malicioso enviado "de fora" (ex: via
 * curl direto na Server Action, ignorando qualquer checagem de UI) é
 * rejeitado ANTES de qualquer chamada ao Stripe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "~/server/db";
import { env } from "~/env";
import { useRollbackTransactionPerTest } from "../../helpers/with-rollback-transaction";

const mockCheckoutCreate = vi.fn();
const mockPortalCreate = vi.fn();

vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: { create: (...args: unknown[]) => mockCheckoutCreate(...args) },
    };
    billingPortal = {
      sessions: { create: (...args: unknown[]) => mockPortalCreate(...args) },
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

describe("Stripe Server Actions - Integração (schema real + Prisma real + Stripe mockado)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_stripe_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const stripeCustomerId = `cus_it_${Date.now()}`;

  beforeEach(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `stripe-it-${Date.now()}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId,
      },
    });
  });

  afterEach(() => {
    mockCheckoutCreate.mockReset();
    mockPortalCreate.mockReset();
    mockRedirect.mockClear();
    mockGetUserId.mockReset();
  });

  describe("createCheckoutSession", () => {
    it("rejeita priceId arbitrário (payload malicioso) sem jamais chamar o Stripe", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const { createCheckoutSession } = await import("~/actions/stripe");

      await expect(
        createCheckoutSession("price_injected_by_curl_123")
      ).rejects.toThrow();

      expect(mockCheckoutCreate).not.toHaveBeenCalled();
    });

    it("rejeita mode fora do enum conhecido sem jamais chamar o Stripe", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const { createCheckoutSession } = await import("~/actions/stripe");

      await expect(
        createCheckoutSession({ priceId: "pro_monthly", mode: "refund" as never })
      ).rejects.toThrow();

      expect(mockCheckoutCreate).not.toHaveBeenCalled();
    });

    it("cria a sessão de checkout quando priceId é uma das 4 chaves reais válidas", async () => {
      mockGetUserId.mockResolvedValue(userId);
      mockCheckoutCreate.mockResolvedValueOnce({ url: "https://stripe.com/pay/cs_it" });
      const { createCheckoutSession } = await import("~/actions/stripe");

      await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
        "NEXT_REDIRECT:https://stripe.com/pay/cs_it"
      );

      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: stripeCustomerId,
          line_items: [
            expect.objectContaining({ price: env.STRIPE_PRICE_ID_PLAN_PRO_MONTHLY }),
          ],
        })
      );
    });
  });

  describe("createCustomerPortalSession", () => {
    it("rejeita returnUrl de open redirect sem jamais chamar o Stripe", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const { createCustomerPortalSession } = await import("~/actions/stripe");

      await expect(
        createCustomerPortalSession("https://evil.com/phish")
      ).rejects.toThrow();

      expect(mockPortalCreate).not.toHaveBeenCalled();
    });

    it("rejeita returnUrl protocol-relative sem jamais chamar o Stripe", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const { createCustomerPortalSession } = await import("~/actions/stripe");

      await expect(
        createCustomerPortalSession("//evil.com/phish")
      ).rejects.toThrow();

      expect(mockPortalCreate).not.toHaveBeenCalled();
    });

    it("cria a sessão do portal com um returnUrl relativo válido", async () => {
      mockGetUserId.mockResolvedValue(userId);
      mockPortalCreate.mockResolvedValueOnce({
        url: "https://billing.stripe.com/portal/it",
      });
      const { createCustomerPortalSession } = await import("~/actions/stripe");

      await expect(
        createCustomerPortalSession("/dashboard/billing")
      ).rejects.toThrow("NEXT_REDIRECT:https://billing.stripe.com/portal/it");

      expect(mockPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ return_url: `${env.BASE_URL}/dashboard/billing` })
      );
    });

    it("rejeita returnUrl com barra invertida (/\\evil.com) sem jamais chamar o Stripe", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const { createCustomerPortalSession } = await import("~/actions/stripe");

      await expect(
        createCustomerPortalSession("/\\evil.com/phish")
      ).rejects.toThrow();

      expect(mockPortalCreate).not.toHaveBeenCalled();
    });
  });
});
