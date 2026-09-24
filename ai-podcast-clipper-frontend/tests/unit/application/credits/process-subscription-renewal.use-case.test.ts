import { describe, it, expect, beforeEach } from "vitest";
import { ProcessSubscriptionRenewalUseCase } from "~/application/use-cases/credits/process-subscription-renewal.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("ProcessSubscriptionRenewalUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let subRepo: InMemorySubscriptionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ProcessSubscriptionRenewalUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    subRepo = new InMemorySubscriptionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ProcessSubscriptionRenewalUseCase(
      userRepo,
      txRepo,
      uow,
      subRepo
    );
  });

  it("deve resetar cota de assinatura mensal e manter créditos avulsos intactos para plano Creator", async () => {
    // Usuário com 30 subscriptionCredits e 50 oneTimeCredits (total 80)
    await userRepo.create({
      id: "user_1",
      email: "creator@test.com",
      subscriptionCredits: 30,
      oneTimeCredits: 50,
      credits: 80,
      plan: "CREATOR",
      stripeCustomerId: "cus_creator_123",
    });

    await subRepo.upsert({
      userId: "user_1",
      stripeSubscriptionId: "sub_creator_123",
      stripePriceId: "price_creator_monthly",
      status: "active",
      plan: "CREATOR",
      monthlyCredits: 150,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });

    const newStart = new Date("2026-09-01");
    const newEnd = new Date("2026-10-01");

    const result = await useCase.execute({
      stripeSubscriptionId: "sub_creator_123",
      currentPeriodStart: newStart,
      currentPeriodEnd: newEnd,
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user_1");
    expect(user?.subscriptionCredits).toBe(150);
    expect(user?.oneTimeCredits).toBe(50);
    expect(user?.credits).toBe(200); // 150 + 50

    const txs = await txRepo.findByUserId("user_1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
    expect(txs[0]?.amount).toBe(150);
    expect(txs[0]?.description).toContain("150 créditos");

    const sub = await subRepo.findByStripeSubscriptionId("sub_creator_123");
    expect(sub?.currentPeriodStart).toEqual(newStart);
    expect(sub?.currentPeriodEnd).toEqual(newEnd);
  });

  it("deve resetar cota de assinatura mensal para plano Pro Studio (500 créditos)", async () => {
    await userRepo.create({
      id: "user_pro",
      email: "pro@test.com",
      subscriptionCredits: 10,
      oneTimeCredits: 20,
      credits: 30,
      plan: "PRO_STUDIO",
      stripeCustomerId: "cus_pro_123",
    });

    await subRepo.upsert({
      userId: "user_pro",
      stripeSubscriptionId: "sub_pro_123",
      stripePriceId: "price_pro_studio_monthly",
      status: "active",
      plan: "PRO_STUDIO",
      monthlyCredits: 500,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });

    const result = await useCase.execute({
      userId: "user_pro",
      plan: "PRO_STUDIO",
      monthlyCredits: 500,
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user_pro");
    expect(user?.subscriptionCredits).toBe(500);
    expect(user?.oneTimeCredits).toBe(20);
    expect(user?.credits).toBe(520);

    const txs = await txRepo.findByUserId("user_pro");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
    expect(txs[0]?.amount).toBe(500);
  });

  it("deve identificar usuário via stripeCustomerId quando stripeSubscriptionId não for fornecido", async () => {
    await userRepo.create({
      id: "user_cust",
      email: "cust@test.com",
      subscriptionCredits: 0,
      oneTimeCredits: 10,
      credits: 10,
      plan: "CREATOR",
      stripeCustomerId: "cus_found_123",
    });

    const result = await useCase.execute({
      stripeCustomerId: "cus_found_123",
      plan: "CREATOR",
      monthlyCredits: 150,
    });

    expect(result.success).toBe(true);
    const user = await userRepo.findById("user_cust");
    expect(user?.subscriptionCredits).toBe(150);
    expect(user?.credits).toBe(160);
  });

  it("deve lançar NotFoundError se o usuário não for encontrado", async () => {
    await expect(
      useCase.execute({
        stripeSubscriptionId: "sub_unknown",
      })
    ).rejects.toThrow(NotFoundError);
  });
});