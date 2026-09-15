import { describe, it, expect, beforeEach } from "vitest";
import { GetUserBillingDataUseCase } from "~/application/use-cases/users/get-user-billing-data.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";

describe("GetUserBillingDataUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let subscriptionRepository: InMemorySubscriptionRepository;
  let useCase: GetUserBillingDataUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    subscriptionRepository = new InMemorySubscriptionRepository();
    useCase = new GetUserBillingDataUseCase(
      userRepository,
      subscriptionRepository
    );
  });

  it("deve retornar null se o usuário não for encontrado", async () => {
    const result = await useCase.execute("non-existent-user");
    expect(result).toBeNull();
  });

  it("deve retornar dados de faturamento sem assinatura ativa se usuário não tiver assinatura", async () => {
    await userRepository.create({
      id: "user-starter",
      email: "starter@test.com",
      credits: 25,
      subscriptionCredits: 0,
      oneTimeCredits: 25,
      plan: "STARTER",
    });

    const result = await useCase.execute("user-starter");
    expect(result).toEqual({
      credits: 25,
      subscriptionCredits: 0,
      oneTimeCredits: 25,
      plan: "STARTER",
      subscription: null,
    });
  });

  it("deve retornar dados completos incluindo assinatura ativa quando presente", async () => {
    const periodStart = new Date("2026-09-01T00:00:00.000Z");
    const periodEnd = new Date("2026-10-01T00:00:00.000Z");

    await userRepository.create({
      id: "user-creator",
      email: "creator@test.com",
      credits: 170,
      subscriptionCredits: 150,
      oneTimeCredits: 20,
      plan: "CREATOR",
    });

    await subscriptionRepository.upsert({
      userId: "user-creator",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_creator",
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      plan: "CREATOR",
      monthlyCredits: 150,
    });

    const result = await useCase.execute("user-creator");
    expect(result).toEqual({
      credits: 170,
      subscriptionCredits: 150,
      oneTimeCredits: 20,
      plan: "CREATOR",
      subscription: {
        id: expect.any(String),
        plan: "CREATOR",
        status: "active",
        monthlyCredits: 150,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });
  });
});
