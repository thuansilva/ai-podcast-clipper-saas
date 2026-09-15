import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "~/app/api/webhooks/stripe/route";
import {
  dispatchStripeCheckoutEvent,
  dispatchStripeSubscriptionEvent,
} from "~/infrastructure/queue/stripe-queue";
import Stripe from "stripe";

vi.mock("~/infrastructure/queue/stripe-queue", () => ({
  dispatchStripeCheckoutEvent: vi.fn(),
  dispatchStripeSubscriptionEvent: vi.fn(),
}));

const mockConstructEvent = vi.fn();

// Mock stripe constructEvent
vi.mock("stripe", () => {
  return {
    default: class MockStripe {
      webhooks = {
        constructEvent: (...args: any[]) => mockConstructEvent(...args),
      };
      checkout = {
        sessions: {
          retrieve: vi.fn(),
        },
      };
    },
  };
});

describe("Stripe Webhook Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar 400 quando a assinatura do Stripe for inválida", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "bad_sig" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Webhook signature verification failed");
  });

  it("deve retornar 200 e despachar evento assíncrono para checkout.session.completed em modo payment", async () => {
    const mockEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_test_123",
          mode: "payment",
          line_items: {
            data: [{ price: { id: "price_small_pack" } }],
          },
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(mockEvent);

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "valid_sig" },
      body: JSON.stringify(mockEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchStripeCheckoutEvent).toHaveBeenCalledWith({
      customerId: "cus_test_123",
      priceId: "price_small_pack",
    });
  });

  it("deve despachar evento para checkout.session.completed em modo subscription", async () => {
    const mockEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_sub",
          customer: "cus_sub_123",
          mode: "subscription",
          subscription: "sub_123",
          line_items: {
            data: [{ price: { id: "price_creator_monthly" } }],
          },
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(mockEvent);

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "valid_sig" },
      body: JSON.stringify(mockEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "checkout.session.completed",
        customerId: "cus_sub_123",
        subscriptionId: "sub_123",
        priceId: "price_creator_monthly",
      })
    );
  });

  it("deve despachar evento para invoice.payment_succeeded", async () => {
    const mockEvent = {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_123",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          lines: {
            data: [
              {
                price: { id: "price_creator_monthly" },
                period: { start: 1725148800, end: 1727740800 },
              },
            ],
          },
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(mockEvent);

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "valid_sig" },
      body: JSON.stringify(mockEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "invoice.payment_succeeded",
        customerId: "cus_test_123",
        subscriptionId: "sub_test_123",
        priceId: "price_creator_monthly",
      })
    );
  });

  it("deve despachar evento para customer.subscription.updated", async () => {
    const mockEvent = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_123",
          customer: "cus_test_123",
          status: "active",
          cancel_at_period_end: true,
          items: {
            data: [{ price: { id: "price_creator_monthly" } }],
          },
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(mockEvent);

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "valid_sig" },
      body: JSON.stringify(mockEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "customer.subscription.updated",
        subscriptionId: "sub_test_123",
        customerId: "cus_test_123",
        status: "active",
        cancelAtPeriodEnd: true,
      })
    );
  });

  it("deve despachar evento para customer.subscription.deleted", async () => {
    const mockEvent = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_123",
          customer: "cus_test_123",
        },
      },
    };

    mockConstructEvent.mockReturnValueOnce(mockEvent);

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "valid_sig" },
      body: JSON.stringify(mockEvent),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "customer.subscription.deleted",
        subscriptionId: "sub_test_123",
        customerId: "cus_test_123",
      })
    );
  });
});
