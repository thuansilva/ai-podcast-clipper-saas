import { describe, it, expect, beforeEach } from "vitest";
import { ExpireSubscriptionUseCase } from "~/application/use-cases/credits/expire-subscription.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("ExpireSubscriptionUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let subRepo: InMemorySubscriptionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ExpireSubscriptionUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subRepo = new InMemorySubscriptionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ExpireSubscriptionUseCase(userRepo, uow, subRepo);
  });

  it("deve rebaixar usuário para plano STARTER, zerar subscriptionCredits e manter oneTimeCredits intactos", async () => {
    // Usuário no plano CREATOR com 80 subscriptionCredits e 50 oneTimeCredits (total 130)
    await userRepo.create({
      id: "user_expire_1",
      email: "canceling@test.com",
      subscriptionCredits: 80,
      oneTimeCredits: 50,
      credits: 130,
      plan: "CREATOR",
      stripeCustomerId: "cus_cancel_1",
    });

    await subRepo.upsert({
      userId: "user_expire_1",
      stripeSubscriptionId: "sub_cancel_1",
      stripePriceId: "price_creator_monthly",
      status: "active",
      plan: "CREATOR",
      monthlyCredits: 150,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });

    const result = await useCase.execute({
      stripeSubscriptionId: "sub_cancel_1",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user_expire_1");
    expect(user?.plan).toBe("STARTER");
    expect(user?.subscriptionCredits).toBe(0);
    expect(user?.oneTimeCredits).toBe(50);
    expect(user?.credits).toBe(50);

    const sub = await subRepo.findByStripeSubscriptionId("sub_cancel_1");
    expect(sub?.status).toBe("canceled");
  });

  it("deve expirar assinatura informando userId diretamente", async () => {
    await userRepo.create({
      id: "user_expire_2",
      email: "user2@test.com",
      subscriptionCredits: 500,
      oneTimeCredits: 25,
      credits: 525,
      plan: "PRO_STUDIO",
    });

    const result = await useCase.execute({
      userId: "user_expire_2",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user_expire_2");
    expect(user?.plan).toBe("STARTER");
    expect(user?.subscriptionCredits).toBe(0);
    expect(user?.oneTimeCredits).toBe(25);
    expect(user?.credits).toBe(25);
  });

  it("deve lançar NotFoundError se o usuário não existir", async () => {
    await expect(
      useCase.execute({
        stripeSubscriptionId: "sub_nonexistent",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
