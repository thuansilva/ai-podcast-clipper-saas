import { describe, it, expect, beforeEach } from "vitest";
import { ConsumeCreditsUseCase } from "~/application/use-cases/credits/consume-credits.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("ConsumeCreditsUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ConsumeCreditsUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ConsumeCreditsUseCase(userRepo, txRepo, uow);
  });

  it("deve consumir os créditos retidos e registrar transação CONSUME", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      credits: 8,
      reservedCredits: 2,
    });

    const result = await useCase.execute({
      userId: "user-1",
      amount: 2,
      fileId: "file-1",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(8);
    expect(user?.reservedCredits).toBe(0);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("CONSUME");
    expect(txs[0]?.amount).toBe(2);
  });

  it("deve lançar NotFoundError se o usuário não for encontrado", async () => {
    await expect(
      useCase.execute({
        userId: "non-existent",
        amount: 2,
        fileId: "file-1",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
