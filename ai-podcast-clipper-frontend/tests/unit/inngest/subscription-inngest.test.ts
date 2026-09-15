import { describe, it, expect, vi, beforeEach } from "vitest";
import { processSubscriptionEvent } from "~/inngest/functions";

const mockRenewalExecute = vi.fn();
const mockExpireExecute = vi.fn();
const mockCheckoutExecute = vi.fn();
const mockSubUpdate = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeHoldCreditsUseCase: vi.fn(),
  makeConsumeCreditsUseCase: vi.fn(),
  makeRefundCreditsUseCase: vi.fn(),
  makeAddCreditsFromStripeWebhookUseCase: vi.fn(),
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

  it("deve processar evento checkout.session.completed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
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
    });

    expect(mockCheckoutExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_creator",
      })
    );
  });

  it("deve processar evento invoice.payment_succeeded", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    await fn({
      event: {
        name: "stripe/invoice.payment_succeeded",
        data: {
          customerId: "cus_456",
          subscriptionId: "sub_456",
        },
      },
    });

    expect(mockRenewalExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_456",
        stripeSubscriptionId: "sub_456",
      })
    );
  });

  it("deve processar evento customer.subscription.deleted", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
    await fn({
      event: {
        name: "stripe/customer.subscription.deleted",
        data: {
          customerId: "cus_789",
          subscriptionId: "sub_789",
        },
      },
    });

    expect(mockExpireExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_789",
        stripeSubscriptionId: "sub_789",
      })
    );
  });

  it("deve processar evento customer.subscription.updated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (processSubscriptionEvent as any).fn;
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
    });

    expect(mockSubUpdate).toHaveBeenCalledWith("sub_update", {
      status: "past_due",
      cancelAtPeriodEnd: true,
    });
  });
});
