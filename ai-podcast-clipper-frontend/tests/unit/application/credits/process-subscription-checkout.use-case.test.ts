import { describe, it, expect, beforeEach } from "vitest";
import { ProcessSubscriptionCheckoutUseCase } from "~/application/use-cases/credits/process-subscription-checkout.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("ProcessSubscriptionCheckoutUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let subRepo: InMemorySubscriptionRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ProcessSubscriptionCheckoutUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subRepo = new InMemorySubscriptionRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ProcessSubscriptionCheckoutUseCase(
      userRepo,
      subRepo,
      txRepo,
      uow
    );
  });

  it("deve ativar assinatura Creator, atribuir 150 subscriptionCredits e preservar oneTimeCredits", async () => {
    await userRepo.create({
      id: "user_sub_1",
      email: "sub1@test.com",
      stripeCustomerId: "cus_creator_1",
      subscriptionCredits: 0,
      oneTimeCredits: 10,
      credits: 10,
      plan: "STARTER",
    });

    const result = await useCase.execute({
      stripeCustomerId: "cus_creator_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_creator_monthly",
      creatorPriceId: "price_creator_monthly",
      proStudioPriceId: "price_pro_studio_monthly",
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe("CREATOR");
    expect(result.subscriptionCredits).toBe(150);
    expect(result.oneTimeCredits).toBe(10);
    expect(result.totalCredits).toBe(160);

    const sub = await subRepo.findByStripeSubscriptionId("sub_1");
    expect(sub?.status).toBe("active");
    expect(sub?.monthlyCredits).toBe(150);

    const txs = await txRepo.findByUserId("user_sub_1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
    expect(txs[0]?.amount).toBe(150);
  });

  it("deve ativar assinatura Pro Studio e atribuir 500 subscriptionCredits", async () => {
    await userRepo.create({
      id: "user_sub_2",
      email: "sub2@test.com",
      stripeCustomerId: "cus_pro_2",
      subscriptionCredits: 0,
      oneTimeCredits: 20,
      credits: 20,
      plan: "STARTER",
    });

    const result = await useCase.execute({
      stripeCustomerId: "cus_pro_2",
      stripeSubscriptionId: "sub_2",
      stripePriceId: "price_pro_studio_monthly",
      creatorPriceId: "price_creator_monthly",
      proStudioPriceId: "price_pro_studio_monthly",
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe("PRO_STUDIO");
    expect(result.subscriptionCredits).toBe(500);
    expect(result.oneTimeCredits).toBe(20);
    expect(result.totalCredits).toBe(520);
  });

  it("deve lançar NotFoundError se cliente Stripe não for encontrado", async () => {
    await expect(
      useCase.execute({
        stripeCustomerId: "cus_unknown",
        stripeSubscriptionId: "sub_3",
        stripePriceId: "price_creator_monthly",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
