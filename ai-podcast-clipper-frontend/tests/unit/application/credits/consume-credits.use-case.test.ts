import { describe, it, expect, beforeEach } from "vitest";
import { ConsumeCreditsUseCase } from "~/application/use-cases/credits/consume-credits.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { InsufficientCreditsError } from "~/domain/errors/insufficient-credits-error";
import { DomainError } from "~/domain/errors/domain-error";

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

  it("deve debitar primeiro da assinatura e registrar auditoria correta", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      subscriptionCredits: 150,
      oneTimeCredits: 50,
      credits: 200,
      reservedCredits: 0,
    });

    const result = await useCase.execute({
      userId: "user-1",
      amount: 160,
      fileId: "file-1",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-1");
    expect(user?.subscriptionCredits).toBe(0);
    expect(user?.oneTimeCredits).toBe(40);
    expect(user?.credits).toBe(40);
    expect(user?.reservedCredits).toBe(0);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("CONSUME");
    expect(txs[0]?.amount).toBe(160);
    expect(txs[0]?.description).toContain("file-1");
  });

  it("deve consumir créditos apenas da assinatura quando o saldo for suficiente", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      subscriptionCredits: 150,
      oneTimeCredits: 50,
      credits: 200,
      reservedCredits: 0,
    });

    const result = await useCase.execute({
      userId: "user-1",
      amount: 50,
      fileId: "file-1",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-1");
    expect(user?.subscriptionCredits).toBe(100);
    expect(user?.oneTimeCredits).toBe(50);
    expect(user?.credits).toBe(150);
    expect(user?.reservedCredits).toBe(0);
  });

  it("deve lançar InsufficientCreditsError quando o saldo total for menor que o valor a consumir", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      subscriptionCredits: 10,
      oneTimeCredits: 10,
      credits: 20,
      reservedCredits: 0,
    });

    await expect(
      useCase.execute({
        userId: "user-1",
        amount: 50,
        fileId: "file-1",
      })
    ).rejects.toThrow(InsufficientCreditsError);
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

  it("deve liberar créditos reservados não utilizados quando heldAmount for maior que amount (evitando vazamento de créditos)", async () => {
    await userRepo.create({
      id: "user-partial",
      email: "partial@example.com",
      subscriptionCredits: 132,
      oneTimeCredits: 8,
      credits: 140,
      reservedCredits: 10,
      plan: "CREATOR",
    });

    await txRepo.create({
      userId: "user-partial",
      amount: 10,
      type: "HOLD",
      description:
        "Hold de 10 créditos para processamento do arquivo file-partial [sub:8,ot:2]",
    });

    const result = await useCase.execute({
      userId: "user-partial",
      amount: 6,
      heldAmount: 10,
      fileId: "file-partial",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-partial");
    // 6 consumidos, 4 devolvidos ao saldo livre
    expect(user?.subscriptionCredits).toBe(136); // 132 + 4
    expect(user?.oneTimeCredits).toBe(8);
    expect(user?.credits).toBe(144); // 140 + 4
    expect(user?.reservedCredits).toBe(0); // 10 - 10

    const txs = await txRepo.findByUserId("user-partial");
    const consumeTx = txs.find((tx) => tx.type === "CONSUME");
    expect(consumeTx).toBeDefined();
    expect(consumeTx?.amount).toBe(6);
  });

  it("deve funcionar normalmente quando heldAmount for igual a amount", async () => {
    await userRepo.create({
      id: "user-exact",
      email: "exact@example.com",
      subscriptionCredits: 50,
      oneTimeCredits: 10,
      credits: 60,
      reservedCredits: 10,
    });

    const result = await useCase.execute({
      userId: "user-exact",
      amount: 10,
      heldAmount: 10,
      fileId: "file-exact",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-exact");
    expect(user?.credits).toBe(60);
    expect(user?.reservedCredits).toBe(0);
  });
});
