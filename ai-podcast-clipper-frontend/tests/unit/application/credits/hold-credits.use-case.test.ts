import { describe, it, expect, beforeEach } from "vitest";
import { HoldCreditsUseCase } from "~/application/use-cases/credits/hold-credits.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { InsufficientCreditsError } from "~/domain/errors/insufficient-credits-error";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("HoldCreditsUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let fileRepo: InMemoryUploadedFileRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: HoldCreditsUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    fileRepo = new InMemoryUploadedFileRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new HoldCreditsUseCase(userRepo, fileRepo, txRepo, uow);
  });

  it("deve reservar créditos com sucesso quando o saldo for suficiente", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      credits: 10,
      reservedCredits: 0,
    });

    const file = await fileRepo.create({
      userId: "user-1",
      s3Key: "test/file.mp4",
      sourceType: "UPLOAD",
      durationSeconds: 120,
    });

    const result = await useCase.execute({
      userId: "user-1",
      durationSeconds: 120,
      fileId: file.id,
    });

    expect(result.success).toBe(true);
    expect(result.heldCredits).toBe(2);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(8);
    expect(user?.reservedCredits).toBe(2);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("HOLD");
    expect(txs[0]?.amount).toBe(2);

    const updatedFile = await fileRepo.findById(file.id);
    expect(updatedFile?.creditsCost).toBe(2);
  });

  it("deve lançar InsufficientCreditsError quando o saldo for menor que o custo", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      credits: 1,
      reservedCredits: 0,
    });

    await expect(
      useCase.execute({
        userId: "user-1",
        durationSeconds: 180, // requer 3 créditos
        fileId: "file-1",
      })
    ).rejects.toThrow(InsufficientCreditsError);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(1);
    expect(user?.reservedCredits).toBe(0);
  });

  it("deve lançar NotFoundError se o usuário não existir", async () => {
    await expect(
      useCase.execute({
        userId: "non-existent",
        durationSeconds: 60,
        fileId: "file-1",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("deve usar o amount explicitamente fornecido ignorando o cálculo baseado em durationSeconds", async () => {
    await userRepo.create({
      id: "user-1",
      email: "test@example.com",
      credits: 10,
      reservedCredits: 0,
    });

    const file = await fileRepo.create({
      userId: "user-1",
      s3Key: "test/file.mp4",
      sourceType: "UPLOAD",
      durationSeconds: 600, // 600s calcularia 10 créditos
    });

    // Passa amount: 3 explicitamente (ex: corte manual de 125s total)
    const result = await useCase.execute({
      userId: "user-1",
      durationSeconds: 600,
      fileId: file.id,
      amount: 3,
    });

    expect(result.success).toBe(true);
    expect(result.heldCredits).toBe(3);

    const user = await userRepo.findById("user-1");
    expect(user?.credits).toBe(7);
    expect(user?.reservedCredits).toBe(3);

    const txs = await txRepo.findByUserId("user-1");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("HOLD");
    expect(txs[0]?.amount).toBe(3);

    const updatedFile = await fileRepo.findById(file.id);
    expect(updatedFile?.creditsCost).toBe(3);
  });

  it("deve impedir race condition e permitir apenas 1 sucesso quando 5 chamadas concorrentes disputarem 10 créditos", async () => {
    await userRepo.create({
      id: "user-concurrency",
      email: "concurrency@example.com",
      credits: 10,
      reservedCredits: 0,
    });

    const files = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        fileRepo.create({
          userId: "user-concurrency",
          s3Key: `test/file-${i}.mp4`,
          sourceType: "UPLOAD",
          durationSeconds: 600, // 10 créditos
        })
      )
    );

    const results = await Promise.allSettled(
      files.map((file) =>
        useCase.execute({
          userId: "user-concurrency",
          durationSeconds: 600,
          fileId: file.id,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    // Todas as rejeições devem ser InsufficientCreditsError
    for (const r of rejected) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(InsufficientCreditsError);
      }
    }

    const user = await userRepo.findById("user-concurrency");
    expect(user?.credits).toBe(0);
    expect(user?.reservedCredits).toBe(10);
  });
});

