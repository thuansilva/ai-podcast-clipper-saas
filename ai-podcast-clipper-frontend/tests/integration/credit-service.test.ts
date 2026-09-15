/**
 * @vitest-environment node
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "~/server/db";
import {
  makeHoldCreditsUseCase,
  makeConsumeCreditsUseCase,
  makeRefundCreditsUseCase,
} from "~/infrastructure/factories/use-case-factories";

const holdCredits = async (userId: string, durationSeconds: number, fileId: string) => {
  const res = await makeHoldCreditsUseCase().execute({ userId, durationSeconds, fileId });
  return { success: res.success, held: res.heldCredits };
};

const consumeCredits = async (userId: string, amount: number, fileId: string) => {
  await makeConsumeCreditsUseCase().execute({ userId, amount, fileId });
};

const refundCredits = async (userId: string, amount: number, fileId: string, reason: string) => {
  await makeRefundCreditsUseCase().execute({ userId, amount, fileId, reason });
};

const CreditService = {
  holdCredits,
  consumeCredits,
  refundCredits,
};

describe("Credit Use Cases Integration Tests", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(credits = 10, reservedCredits = 0) {
    const user = await db.user.create({
      data: {
        id: `user_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits,
        reservedCredits,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestFile(userId: string) {
    return await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`,
        displayName: "test-video.mp4",
        status: "queued",
      },
    });
  }

  afterAll(async () => {
    // Cascade delete users and all associated files and transactions
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  describe("holdCredits", () => {
    it("deve debitar credits, incrementar reservedCredits, registrar HOLD e atualizar creditsCost no UploadedFile", async () => {
      const user = await createTestUser(10, 0);
      const file = await createTestFile(user.id);

      // durationSeconds = 120s -> ceil(120/60) = 2 créditos
      const result = await CreditService.holdCredits(user.id, 120, file.id);

      expect(result).toEqual({ success: true, held: 2 });

      // Verificar estado atualizado do usuário
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.credits).toBe(8);
      expect(updatedUser?.reservedCredits).toBe(2);

      // Verificar UploadedFile atualizado
      const updatedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(updatedFile?.creditsCost).toBe(2);

      // Verificar registro em CreditTransaction
      const transaction = await db.creditTransaction.findFirst({
        where: { userId: user.id, type: "HOLD" },
      });
      expect(transaction).not.toBeNull();
      expect(transaction?.amount).toBe(2);
      expect(transaction?.type).toBe("HOLD");
    });

    it("deve lançar erro e manter o estado intocado se o saldo for insuficiente", async () => {
      const user = await createTestUser(1, 0);
      const file = await createTestFile(user.id);

      // durationSeconds = 180s -> 3 créditos necessários, usuário só tem 1
      await expect(
        CreditService.holdCredits(user.id, 180, file.id)
      ).rejects.toThrow(/insufficient credits|saldo insuficiente/i);

      // Verificar que nada foi debitado (rollback da transação)
      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(1);
      expect(freshUser?.reservedCredits).toBe(0);

      // Verificar que nenhum registro de transação foi criado
      const transactions = await db.creditTransaction.findMany({
        where: { userId: user.id },
      });
      expect(transactions).toHaveLength(0);

      // Verificar que UploadedFile permaneceu intocado
      const freshFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(freshFile?.creditsCost).toBe(0);
    });
  });

  describe("consumeCredits", () => {
    it("deve debitar reservedCredits sem alterar credits e registrar CONSUME", async () => {
      const user = await createTestUser(8, 2);
      const file = await createTestFile(user.id);

      await CreditService.consumeCredits(user.id, 2, file.id);

      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(8);
      expect(freshUser?.reservedCredits).toBe(0);

      const transaction = await db.creditTransaction.findFirst({
        where: { userId: user.id, type: "CONSUME" },
      });
      expect(transaction).not.toBeNull();
      expect(transaction?.amount).toBe(2);
      expect(transaction?.type).toBe("CONSUME");
    });
  });

  describe("refundCredits", () => {
    it("deve estornar reservedCredits para credits, registrar REFUND e atualizar status/errorMessage no UploadedFile", async () => {
      const user = await createTestUser(8, 2);
      const file = await createTestFile(user.id);
      const failureReason = "Worker timeout while processing clips";

      await CreditService.refundCredits(user.id, 2, file.id, failureReason);

      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(10);
      expect(freshUser?.reservedCredits).toBe(0);

      // UploadedFile deve estar failed com errorMessage preenchida
      const freshFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(freshFile?.status).toBe("failed");
      expect(freshFile?.errorMessage).toBe(failureReason);

      // CreditTransaction REFUND
      const transaction = await db.creditTransaction.findFirst({
        where: { userId: user.id, type: "REFUND" },
      });
      expect(transaction).not.toBeNull();
      expect(transaction?.amount).toBe(2);
      expect(transaction?.type).toBe("REFUND");
    });
  });

  describe("Race Conditions & Concurrency Protection", () => {
    it("deve impedir saldo negativo e permitir apenas 1 sucesso quando 5 requisições concorrentes tentarem reservar todo o saldo (10 créditos)", async () => {
      const user = await createTestUser(10, 0);

      // Criar 5 arquivos de vídeo para simular 5 jobs concorrentes
      const files = await Promise.all([
        createTestFile(user.id),
        createTestFile(user.id),
        createTestFile(user.id),
        createTestFile(user.id),
        createTestFile(user.id),
      ]);

      // Dispara 5 requisições de 10 créditos simultâneas (durationSeconds = 600s -> 10 créditos)
      const results = await Promise.allSettled(
        files.map((file) => CreditService.holdCredits(user.id, 600, file.id))
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exatamente 1 deve ter sucesso e 4 devem falhar por saldo insuficiente
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);

      // Todas as rejeições devem conter mensagem de saldo insuficiente
      for (const r of rejected) {
        if (r.status === "rejected") {
          expect(String(r.reason)).toMatch(/insufficient credits|saldo insuficiente/i);
        }
      }

      // Validação rigorosa no banco de dados
      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(0); // NUNCA deve ser negativo (-40)
      expect(freshUser?.reservedCredits).toBe(10);

      // Apenas 1 transação de HOLD registrada
      const holdTransactions = await db.creditTransaction.findMany({
        where: { userId: user.id, type: "HOLD" },
      });
      expect(holdTransactions).toHaveLength(1);
      expect(holdTransactions[0]?.amount).toBe(10);
    });

    it("deve debitar de forma atômica e consistente quando requisições parciais competirem por créditos", async () => {
      const user = await createTestUser(10, 0);

      // 4 arquivos competindo por 3 créditos cada (total de 12 solicitados para 10 disponíveis)
      const files = await Promise.all([
        createTestFile(user.id),
        createTestFile(user.id),
        createTestFile(user.id),
        createTestFile(user.id),
      ]);

      // durationSeconds = 180s -> 3 créditos cada
      const results = await Promise.allSettled(
        files.map((file) => CreditService.holdCredits(user.id, 180, file.id))
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // 3 requisições consomem 9 créditos; a 4ª falha porque resta apenas 1 crédito
      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(1);

      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(1); // 10 - 9 = 1
      expect(freshUser?.reservedCredits).toBe(9); // 3 * 3 = 9

      const holdTransactions = await db.creditTransaction.findMany({
        where: { userId: user.id, type: "HOLD" },
      });
      expect(holdTransactions).toHaveLength(3);
    });

    it("deve impedir consumo concorrente duplicado de créditos reservados", async () => {
      const user = await createTestUser(5, 10);
      const file1 = await createTestFile(user.id);
      const file2 = await createTestFile(user.id);

      // Duas chamadas simultâneas tentando consumir 10 créditos reservados
      const results = await Promise.allSettled([
        CreditService.consumeCredits(user.id, 10, file1.id),
        CreditService.consumeCredits(user.id, 10, file2.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Apenas 1 deve conseguir consumir os 10 créditos reservados
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (rejected[0]?.status === "rejected") {
        expect(String(rejected[0].reason)).toMatch(/saldo insuficiente de créditos reservados/i);
      }

      const freshUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(freshUser?.credits).toBe(5);
      expect(freshUser?.reservedCredits).toBe(0); // NUNCA negativo (-10)

      const consumeTransactions = await db.creditTransaction.findMany({
        where: { userId: user.id, type: "CONSUME" },
      });
      expect(consumeTransactions).toHaveLength(1);
    });
  });
});
