import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCheckoutSession, createCustomerPortalSession } from "~/actions/stripe";

// Deliberately NOT mocking ~/infrastructure/factories/rate-limiter-factory
// here: this file exercises the real in-memory limiter to prove
// createCheckoutSession/createCustomerPortalSession actually enforce the
// limit (item HIGH do checklist go-live: "Rate limit ausente em actions de
// projeto e billing" — evita loop de criação de sessões Stripe).

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

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeStripePaymentGateway: () => ({
    createCheckoutSession: mockCreateCheckoutSession,
    createBillingPortalSession: mockCreateBillingPortalSession,
  }),
  makeUserRepository: () => ({
    findById: mockFindById,
  }),
  makeGetUserBillingDataUseCase: () => ({
    execute: vi.fn(),
  }),
}));

vi.mock("~/env", () => ({
  env: {
    STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY: "price_starter_monthly_test",
    STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL: "price_starter_annual_test",
    STRIPE_PRICE_ID_PLAN_PRO_MONTHLY: "price_pro_monthly_test",
    STRIPE_PRICE_ID_PLAN_PRO_ANNUAL: "price_pro_annual_test",
    BASE_URL: "https://test.saas.com",
  },
}));

function uniqueUserId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

describe("Stripe Server Actions - rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createCheckoutSession: permite até 5 sessões por minuto e bloqueia a 6a sem chamar o Stripe", async () => {
    const userId = uniqueUserId("user-checkout-rl");
    mockGetUserId.mockResolvedValue(userId);
    mockFindById.mockResolvedValue({ stripeCustomerId: "cus_rl_test" });
    mockCreateCheckoutSession.mockResolvedValue("https://stripe.com/pay/cs_rl");

    for (let i = 0; i < 5; i++) {
      await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
        "NEXT_REDIRECT:"
      );
    }
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(5);

    await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
      "Too many requests"
    );
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(5);
  });

  it("createCustomerPortalSession: permite até 5 sessões por minuto e bloqueia a 6a sem chamar o Stripe", async () => {
    const userId = uniqueUserId("user-portal-rl");
    mockGetUserId.mockResolvedValue(userId);
    mockFindById.mockResolvedValue({ stripeCustomerId: "cus_rl_test" });
    mockCreateBillingPortalSession.mockResolvedValue(
      "https://billing.stripe.com/portal/rl"
    );

    for (let i = 0; i < 5; i++) {
      await expect(createCustomerPortalSession()).rejects.toThrow(
        "NEXT_REDIRECT:"
      );
    }
    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(5);

    await expect(createCustomerPortalSession()).rejects.toThrow(
      "Too many requests"
    );
    expect(mockCreateBillingPortalSession).toHaveBeenCalledTimes(5);
  });

  it("não compartilha o limite entre usuários diferentes (createCheckoutSession)", async () => {
    const userId = uniqueUserId("user-checkout-rl-isolated");
    mockGetUserId.mockResolvedValue(userId);
    mockFindById.mockResolvedValue({ stripeCustomerId: "cus_rl_test" });
    mockCreateCheckoutSession.mockResolvedValue("https://stripe.com/pay/cs_rl");

    for (let i = 0; i < 5; i++) {
      await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
        "NEXT_REDIRECT:"
      );
    }

    mockGetUserId.mockResolvedValue(uniqueUserId("another-user-checkout-rl"));
    await expect(createCheckoutSession("pro_monthly")).rejects.toThrow(
      "NEXT_REDIRECT:"
    );
  });
});
