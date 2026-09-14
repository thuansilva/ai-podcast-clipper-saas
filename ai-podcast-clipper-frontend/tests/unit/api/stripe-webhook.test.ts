import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "~/app/api/webhooks/stripe/route";
import { dispatchStripeCheckoutEvent } from "~/infrastructure/queue/stripe-queue";
import Stripe from "stripe";

vi.mock("~/infrastructure/queue/stripe-queue", () => ({
  dispatchStripeCheckoutEvent: vi.fn(),
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

  it("deve retornar 200 e despachar evento assíncrono para checkout.session.completed", async () => {
    const mockEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_test_123",
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
});
