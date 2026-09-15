import { describe, it, expect, vi, beforeEach } from "vitest";
import { StripePaymentGateway } from "~/infrastructure/payments/stripe-payment.gateway";

const mockCheckoutSessionsCreate = vi.fn();
const mockBillingPortalSessionsCreate = vi.fn();
const mockCustomersCreate = vi.fn();

vi.mock("stripe", () => {
  return {
    default: class MockStripe {
      checkout = {
        sessions: {
          create: (...args: any[]) => mockCheckoutSessionsCreate(...args),
        },
      };
      billingPortal = {
        sessions: {
          create: (...args: any[]) => mockBillingPortalSessionsCreate(...args),
        },
      };
      customers = {
        create: (...args: any[]) => mockCustomersCreate(...args),
      };
    },
  };
});

vi.mock("~/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_12345",
  },
}));

describe("StripePaymentGateway", () => {
  let gateway: StripePaymentGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new StripePaymentGateway();
  });

  describe("createCheckoutSession", () => {
    it("deve criar sessão de checkout com mode 'subscription' quando solicitado", async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/c/pay/cs_sub_123",
      });

      const url = await gateway.createCheckoutSession({
        customerId: "cus_sub_123",
        priceId: "price_creator_monthly",
        mode: "subscription",
        successUrl: "https://example.com/dashboard?success=true",
        cancelUrl: "https://example.com/dashboard/billing?canceled=true",
      });

      expect(url).toBe("https://checkout.stripe.com/c/pay/cs_sub_123");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        line_items: [{ price: "price_creator_monthly", quantity: 1 }],
        customer: "cus_sub_123",
        mode: "subscription",
        success_url: "https://example.com/dashboard?success=true",
        cancel_url: "https://example.com/dashboard/billing?canceled=true",
      });
    });

    it("deve criar sessão de checkout com mode 'payment' para recargas avulsas", async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/c/pay/cs_pay_456",
      });

      const url = await gateway.createCheckoutSession({
        customerId: "cus_pay_456",
        priceId: "price_small_pack",
        mode: "payment",
        successUrl: "https://example.com/dashboard?success=true",
      });

      expect(url).toBe("https://checkout.stripe.com/c/pay/cs_pay_456");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        line_items: [{ price: "price_small_pack", quantity: 1 }],
        customer: "cus_pay_456",
        mode: "payment",
        success_url: "https://example.com/dashboard?success=true",
      });
    });

    it("deve usar mode 'payment' por padrão se mode não for fornecido", async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: "https://checkout.stripe.com/c/pay/cs_pay_default",
      });

      const url = await gateway.createCheckoutSession({
        customerId: "cus_default",
        priceId: "price_default",
        successUrl: "https://example.com/dashboard?success=true",
      });

      expect(url).toBe("https://checkout.stripe.com/c/pay/cs_pay_default");
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
        })
      );
    });

    it("deve lançar erro se a sessão do Stripe não retornar URL", async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: null,
      });

      await expect(
        gateway.createCheckoutSession({
          customerId: "cus_no_url",
          priceId: "price_small",
          successUrl: "https://example.com/dashboard",
        })
      ).rejects.toThrow("Failed to create Stripe checkout session URL");
    });
  });

  describe("createBillingPortalSession", () => {
    it("deve gerar URL do Billing Portal quando solicitado com objeto de entrada", async () => {
      mockBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: "https://billing.stripe.com/p/session_portal_123",
      });

      const url = await gateway.createBillingPortalSession({
        customerId: "cus_portal_123",
        returnUrl: "https://example.com/dashboard/billing",
      });

      expect(url).toBe("https://billing.stripe.com/p/session_portal_123");
      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: "cus_portal_123",
        return_url: "https://example.com/dashboard/billing",
      });
    });

    it("deve gerar URL do Billing Portal quando solicitado com argumentos posicionais", async () => {
      mockBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: "https://billing.stripe.com/p/session_portal_456",
      });

      const url = await (gateway as any).createBillingPortalSession(
        "cus_portal_456",
        "https://example.com/dashboard/billing"
      );

      expect(url).toBe("https://billing.stripe.com/p/session_portal_456");
      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: "cus_portal_456",
        return_url: "https://example.com/dashboard/billing",
      });
    });

    it("deve lançar erro se o Billing Portal não retornar URL", async () => {
      mockBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: null,
      });

      await expect(
        gateway.createBillingPortalSession({
          customerId: "cus_error",
          returnUrl: "https://example.com/dashboard",
        })
      ).rejects.toThrow("Failed to create Stripe billing portal session URL");
    });
  });

  describe("createCustomer", () => {
    it("deve chamar stripe.customers.create e retornar customer id", async () => {
      mockCustomersCreate.mockResolvedValueOnce({
        id: "cus_real_789",
      });

      const customerId = await gateway.createCustomer("teste@empresa.com", "Teste Nome");
      expect(customerId).toBe("cus_real_789");
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: "teste@empresa.com",
        name: "Teste Nome",
      });
    });
  });
});
