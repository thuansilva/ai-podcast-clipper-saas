import { describe, it, expect, beforeEach } from "vitest";
import { AddCreditsFromStripeWebhookUseCase } from "~/application/use-cases/credits/add-credits-from-stripe.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("AddCreditsFromStripeWebhookUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: AddCreditsFromStripeWebhookUseCase;

  const SMALL_PRICE = "price_small_123";
  const MEDIUM_PRICE = "price_med_456";
  const LARGE_PRICE = "price_large_789";

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new AddCreditsFromStripeWebhookUseCase(userRepo, txRepo, uow);
  });

  it("deve adicionar 50 créditos para o pacote Small", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      stripeCustomerId: "cus_123",
      credits: 10,
      reservedCredits: 0,
    });

    const result = await useCase.execute({
      stripeCustomerId: "cus_123",
      priceId: SMALL_PRICE,
      smallPackPriceId: SMALL_PRICE,
      mediumPackPriceId: MEDIUM_PRICE,
      largePackPriceId: LARGE_PRICE,
    });

    expect(result.success).toBe(true);
    expect(result.addedCredits).toBe(50);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(60);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("PURCHASE");
    expect(txs[0]?.amount).toBe(50);
  });

  it("deve adicionar 150 créditos para o pacote Medium e 500 para Large", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      stripeCustomerId: "cus_123",
      credits: 0,
      reservedCredits: 0,
    });

    const resMed = await useCase.execute({
      stripeCustomerId: "cus_123",
      priceId: MEDIUM_PRICE,
      smallPackPriceId: SMALL_PRICE,
      mediumPackPriceId: MEDIUM_PRICE,
      largePackPriceId: LARGE_PRICE,
    });
    expect(resMed.addedCredits).toBe(150);

    const resLarge = await useCase.execute({
      stripeCustomerId: "cus_123",
      priceId: LARGE_PRICE,
      smallPackPriceId: SMALL_PRICE,
      mediumPackPriceId: MEDIUM_PRICE,
      largePackPriceId: LARGE_PRICE,
    });
    expect(resLarge.addedCredits).toBe(500);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(650);
  });

  it("deve lançar NotFoundError se stripeCustomerId não for encontrado", async () => {
    await expect(
      useCase.execute({
        stripeCustomerId: "cus_unknown",
        priceId: SMALL_PRICE,
        smallPackPriceId: SMALL_PRICE,
        mediumPackPriceId: MEDIUM_PRICE,
        largePackPriceId: LARGE_PRICE,
      })
    ).rejects.toThrow(NotFoundError);
  });
});
