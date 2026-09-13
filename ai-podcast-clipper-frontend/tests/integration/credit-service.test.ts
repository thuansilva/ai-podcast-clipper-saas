/**
 * @vitest-environment node
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "~/server/db";
import { CreditService, holdCredits, consumeCredits, refundCredits } from "~/server/services/credit-service";

describe("CreditService Integration Tests", () => {
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
});
