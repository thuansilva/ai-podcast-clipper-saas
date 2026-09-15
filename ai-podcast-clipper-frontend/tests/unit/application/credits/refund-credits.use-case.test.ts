import { describe, it, expect, beforeEach } from "vitest";
import { RefundCreditsUseCase } from "~/application/use-cases/credits/refund-credits.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("RefundCreditsUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let fileRepo: InMemoryUploadedFileRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: RefundCreditsUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    fileRepo = new InMemoryUploadedFileRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new RefundCreditsUseCase(userRepo, fileRepo, txRepo, uow);
  });

  it("deve estornar créditos devolvendo para o saldo livre e marcar arquivo como failed", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      credits: 8,
      reservedCredits: 2,
    });

    const file = await fileRepo.create({
      userId: "user-1",
      s3Key: "test/failed.mp4",
      sourceType: "UPLOAD",
      status: "processing",
    });

    const result = await useCase.execute({
      userId: "user-1",
      amount: 2,
      fileId: file.id,
      reason: "Erro no container GPU",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(10);
    expect(user?.reservedCredits).toBe(0);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("REFUND");
    expect(txs[0]?.description).toContain("Erro no container GPU");

    const updatedFile = await fileRepo.findById(file.id);
    expect(updatedFile?.status).toBe("failed");
    expect(updatedFile?.errorMessage).toBe("Erro no container GPU");
  });

  it("deve estornar créditos incrementando oneTimeCredits e mantendo a invariante credits = subscriptionCredits + oneTimeCredits", async () => {
    await userRepo.create({
      id: "user-2",
      email: "segregated@example.com",
      subscriptionCredits: 50,
      oneTimeCredits: 10,
      credits: 60,
      reservedCredits: 10,
    });

    const file = await fileRepo.create({
      userId: "user-2",
      s3Key: "test/failed-2.mp4",
      sourceType: "UPLOAD",
      status: "processing",
    });

    const result = await useCase.execute({
      userId: "user-2",
      amount: 10,
      fileId: file.id,
      reason: "Timeout na GPU",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-2");
    expect(user?.subscriptionCredits).toBe(50);
    expect(user?.oneTimeCredits).toBe(20);
    expect(user?.credits).toBe(70);
    expect(user?.reservedCredits).toBe(0);
  });

  it("deve estornar créditos respeitando o breakdown da transação de HOLD (evitando lavagem de créditos)", async () => {
    await userRepo.create({
      id: "user-laundering",
      email: "laundering@example.com",
      subscriptionCredits: 142,
      oneTimeCredits: 8,
      credits: 150,
      reservedCredits: 10,
      plan: "CREATOR",
    });

    const file = await fileRepo.create({
      userId: "user-laundering",
      s3Key: "test/file-laundering.mp4",
      sourceType: "UPLOAD",
      status: "processing",
    });

    // Registra transação HOLD com breakdown [sub:8,ot:2]
    await txRepo.create({
      userId: "user-laundering",
      amount: 10,
      type: "HOLD",
      description: `Hold de 10 créditos para processamento do arquivo ${file.id} [sub:8,ot:2]`,
    });

    const result = await useCase.execute({
      userId: "user-laundering",
      amount: 10,
      fileId: file.id,
      reason: "Falha de processamento GPU",
    });

    expect(result.success).toBe(true);

    const user = await userRepo.findById("user-laundering");
    // Restaura 8 para subscriptionCredits (142 + 8 = 150) e 2 para oneTimeCredits (8 + 2 = 10)
    expect(user?.subscriptionCredits).toBe(150);
    expect(user?.oneTimeCredits).toBe(10);
    expect(user?.credits).toBe(160);
    expect(user?.reservedCredits).toBe(0);
  });

  it("deve lançar NotFoundError se o usuário não existir", async () => {
    await expect(
      useCase.execute({
        userId: "non-existent",
        amount: 2,
        fileId: "file-1",
        reason: "Erro",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
