import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  createCheckoutSessionAction,
  createCustomerPortalSessionAction,
  createPortalSession,
  getUserBillingData,
} from "~/actions/stripe";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({
    getUserId: mockGetUserId,
  }),
}));

const mockFindById = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockCreateBillingPortalSession = vi.fn();
const mockGetUserBillingDataExecute = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeStripePaymentGateway: () => ({
    createCheckoutSession: mockCreateCheckoutSession,
    createBillingPortalSession: mockCreateBillingPortalSession,
  }),
  makeUserRepository: () => ({
    findById: mockFindById,
  }),
  makeGetUserBillingDataUseCase: () => ({
    execute: mockGetUserBillingDataExecute,
  }),
}));

vi.mock("~/env", () => ({
  env: {
    STRIPE_SMALL_CREDIT_PACK: "price_small_test",
    STRIPE_MEDIUM_CREDIT_PACK: "price_med_test",
    STRIPE_LARGE_CREDIT_PACK: "price_large_test",
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: "price_creator_test",
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: "price_pro_test",
    BASE_URL: "https://test.saas.com",
  },
}));

describe("Stripe Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCheckoutSession", () => {
    it("deve lançar Unauthorized se usuário não estiver autenticado", async () => {
      mockGetUserId.mockResolvedValueOnce(null);

      await expect(createCheckoutSession("small")).rejects.toThrow("Unauthorized");
      expect(mockFindById).not.toHaveBeenCalled();
    });

    it("deve lançar erro se usuário não possuir stripeCustomerId", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: null });

      await expect(createCheckoutSession("small")).rejects.toThrow(
        "User has no stripeCustomerId"
      );
    });

    it("deve criar sessão com mode 'payment' para pacote avulso small", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: "cus_user_1" });
      mockCreateCheckoutSession.mockResolvedValueOnce("https://stripe.com/pay/cs_123");

      await expect(createCheckoutSession("small")).rejects.toThrow(
        "NEXT_REDIRECT:https://stripe.com/pay/cs_123"
      );

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        customerId: "cus_user_1",
        priceId: "price_small_test",
        mode: "payment",
        successUrl: "https://test.saas.com/dashboard?success=true",
        cancelUrl: "https://test.saas.com/dashboard/billing?canceled=true",
      });
      expect(mockRedirect).toHaveBeenCalledWith("https://stripe.com/pay/cs_123");
    });

    it("deve criar sessão com mode 'subscription' para plano creator", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: "cus_user_1" });
      mockCreateCheckoutSession.mockResolvedValueOnce("https://stripe.com/sub/cs_creator");

      await expect(createCheckoutSession("creator")).rejects.toThrow(
        "NEXT_REDIRECT:https://stripe.com/sub/cs_creator"
      );

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        customerId: "cus_user_1",
        priceId: "price_creator_test",
        mode: "subscription",
        successUrl: "https://test.saas.com/dashboard?success=true",
        cancelUrl: "https://test.saas.com/dashboard/billing?canceled=true",
      });
      expect(mockRedirect).toHaveBeenCalledWith("https://stripe.com/sub/cs_creator");
    });

    it("deve criar sessão com mode 'subscription' para plano pro_studio", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: "cus_user_1" });
      mockCreateCheckoutSession.mockResolvedValueOnce("https://stripe.com/sub/cs_pro");

      await expect(createCheckoutSession("pro_studio")).rejects.toThrow(
        "NEXT_REDIRECT:https://stripe.com/sub/cs_pro"
      );

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        customerId: "cus_user_1",
        priceId: "price_pro_test",
        mode: "subscription",
        successUrl: "https://test.saas.com/dashboard?success=true",
        cancelUrl: "https://test.saas.com/dashboard/billing?canceled=true",
      });
    });

    it("deve respeitar mode explícito quando fornecido", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: "cus_user_1" });
      mockCreateCheckoutSession.mockResolvedValueOnce("https://stripe.com/pay/cs_custom");

      await expect(
        createCheckoutSession("price_custom_123", "subscription")
      ).rejects.toThrow("NEXT_REDIRECT:https://stripe.com/pay/cs_custom");

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        customerId: "cus_user_1",
        priceId: "price_custom_123",
        mode: "subscription",
        successUrl: "https://test.saas.com/dashboard?success=true",
        cancelUrl: "https://test.saas.com/dashboard/billing?canceled=true",
      });
    });
  });

  describe("createCustomerPortalSession", () => {
    it("deve lançar Unauthorized se usuário não estiver autenticado", async () => {
      mockGetUserId.mockResolvedValueOnce(null);

      await expect(createCustomerPortalSession()).rejects.toThrow("Unauthorized");
    });

    it("deve lançar erro se usuário não possuir stripeCustomerId", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({ stripeCustomerId: null });

      await expect(createCustomerPortalSession()).rejects.toThrow(
        "User has no stripeCustomerId"
      );
    });

    it("deve criar sessão do portal e redirecionar", async () => {
      mockGetUserId.mockResolvedValueOnce("user-1");
      mockFindById.mockResolvedValueOnce({
        stripeCustomerId: "cus_user_portal",
      });
      mockCreateBillingPortalSession.mockResolvedValueOnce(
        "https://billing.stripe.com/portal/ses_abc"
      );

      await expect(createCustomerPortalSession()).rejects.toThrow(
        "NEXT_REDIRECT:https://billing.stripe.com/portal/ses_abc"
      );

      expect(mockCreateBillingPortalSession).toHaveBeenCalledWith({
        customerId: "cus_user_portal",
        returnUrl: "https://test.saas.com/dashboard/billing",
      });
      expect(mockRedirect).toHaveBeenCalledWith(
        "https://billing.stripe.com/portal/ses_abc"
      );
    });
  });

  describe("getUserBillingData", () => {
    it("deve retornar null se usuário não estiver autenticado", async () => {
      mockGetUserId.mockResolvedValueOnce(null);

      const result = await getUserBillingData();
      expect(result).toBeNull();
      expect(mockGetUserBillingDataExecute).not.toHaveBeenCalled();
    });

    it("deve invocar GetUserBillingDataUseCase com o userId autenticado", async () => {
      mockGetUserId.mockResolvedValueOnce("user-billing-1");
      const mockOutput = {
        credits: 100,
        subscriptionCredits: 50,
        oneTimeCredits: 50,
        plan: "CREATOR",
        subscription: null,
      };
      mockGetUserBillingDataExecute.mockResolvedValueOnce(mockOutput);

      const result = await getUserBillingData();
      expect(result).toEqual(mockOutput);
      expect(mockGetUserBillingDataExecute).toHaveBeenCalledWith("user-billing-1");
    });
  });

  describe("Aliases exportados", () => {
    it("deve exportar createCheckoutSessionAction referenciando createCheckoutSession", () => {
      expect(createCheckoutSessionAction).toBe(createCheckoutSession);
    });

    it("deve exportar createCustomerPortalSessionAction e createPortalSession referenciando createCustomerPortalSession", () => {
      expect(createCustomerPortalSessionAction).toBe(createCustomerPortalSession);
      expect(createPortalSession).toBe(createCustomerPortalSession);
    });
  });
});
