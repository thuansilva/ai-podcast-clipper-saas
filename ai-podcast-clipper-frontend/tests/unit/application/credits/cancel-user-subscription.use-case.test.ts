import { describe, it, expect, vi, beforeEach } from "vitest";
import { CancelUserSubscriptionUseCase } from "~/application/use-cases/credits/cancel-user-subscription.use-case";
import { ExpireSubscriptionUseCase } from "~/application/use-cases/credits/expire-subscription.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";

describe("CancelUserSubscriptionUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
  let uow: InMemoryUnitOfWork;
  let paymentGateway: IPaymentGateway;
  let expireSubscriptionUseCase: ExpireSubscriptionUseCase;
  let useCase: CancelUserSubscriptionUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    uow = new InMemoryUnitOfWork();

    paymentGateway = {
      createCheckoutSession: vi.fn(),
      createBillingPortalSession: vi.fn(),
      createCustomer: vi.fn(),
      cancelSubscription: vi.fn().mockResolvedValue(undefined),
    };

    expireSubscriptionUseCase = new ExpireSubscriptionUseCase(
      userRepo,
      uow,
      subscriptionRepo
    );

    useCase = new CancelUserSubscriptionUseCase(
      subscriptionRepo,
      paymentGateway,
      expireSubscriptionUseCase
    );
  });

  it("assinatura ativa: cancela no Stripe e expira a assinatura (rebaixa plano/créditos)", async () => {
    await userRepo.create({
      id: "user_with_sub",
      email: "comassinatura@test.com",
      credits: 100,
      subscriptionCredits: 80,
      oneTimeCredits: 20,
      plan: "PRO",
    });

    await subscriptionRepo.upsert({
      userId: "user_with_sub",
      stripeSubscriptionId: "sub_active_1",
      stripePriceId: "price_pro_monthly",
      status: "active",
      plan: "PRO",
      monthlyCredits: 300,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await useCase.execute({ userId: "user_with_sub" });

    expect(paymentGateway.cancelSubscription).toHaveBeenCalledWith(
      "sub_active_1"
    );

    const sub = await subscriptionRepo.findByStripeSubscriptionId(
      "sub_active_1"
    );
    expect(sub?.status).toBe("canceled");

    const user = await userRepo.findById("user_with_sub");
    expect(user?.plan).toBe("STARTER");
    expect(user?.subscriptionCredits).toBe(0);
  });

  it("sem assinatura: não chama o Stripe nem expira nada", async () => {
    await userRepo.create({
      id: "user_no_sub",
      email: "semassinatura@test.com",
      credits: 10,
    });

    await useCase.execute({ userId: "user_no_sub" });

    expect(paymentGateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it("assinatura já cancelada: não chama o Stripe de novo (idempotente)", async () => {
    await userRepo.create({
      id: "user_already_canceled",
      email: "jacancelada@test.com",
      credits: 10,
    });

    await subscriptionRepo.upsert({
      userId: "user_already_canceled",
      stripeSubscriptionId: "sub_already_canceled_1",
      stripePriceId: "price_starter_monthly",
      status: "canceled",
      plan: "STARTER",
      monthlyCredits: 150,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await useCase.execute({ userId: "user_already_canceled" });

    expect(paymentGateway.cancelSubscription).not.toHaveBeenCalled();
  });

  it("falha do gateway de pagamento: propaga o erro e não expira a assinatura", async () => {
    paymentGateway.cancelSubscription = vi
      .fn()
      .mockRejectedValue(new Error("Stripe indisponível"));

    await userRepo.create({
      id: "user_stripe_error",
      email: "erro@test.com",
      credits: 10,
      plan: "PRO",
    });

    await subscriptionRepo.upsert({
      userId: "user_stripe_error",
      stripeSubscriptionId: "sub_error_1",
      stripePriceId: "price_pro_monthly",
      status: "active",
      plan: "PRO",
      monthlyCredits: 300,
      currentPeriodStart: new Date("2026-09-01"),
      currentPeriodEnd: new Date("2026-10-01"),
    });

    await expect(
      useCase.execute({ userId: "user_stripe_error" })
    ).rejects.toThrow("Stripe indisponível");

    const user = await userRepo.findById("user_stripe_error");
    expect(user?.plan).toBe("PRO");

    const sub = await subscriptionRepo.findByStripeSubscriptionId(
      "sub_error_1"
    );
    expect(sub?.status).toBe("active");
  });
});
