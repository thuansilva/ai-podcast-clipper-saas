import { db } from "~/server/db";
import { calculateVideoCredits } from "~/lib/credits";

export interface HoldCreditsResult {
  success: boolean;
  held: number;
}

/**
 * Reserva créditos atômicos para o processamento de um vídeo.
 * - Calcula créditos com base na duração (RN-01).
 * - Valida se o saldo de créditos do usuário é suficiente.
 * - Em transação atômica: decrementa credits, incrementa reservedCredits,
 *   cria CreditTransaction HOLD e atualiza creditsCost no UploadedFile.
 */
export async function holdCredits(
  userId: string,
  durationSeconds: number,
  fileId: string
): Promise<HoldCreditsResult> {
  const required = calculateVideoCredits(durationSeconds);

  return await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true, reservedCredits: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (user.credits < required) {
      throw new Error(
        `Insufficient credits: required ${required}, available ${user.credits}`
      );
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        credits: { decrement: required },
        reservedCredits: { increment: required },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: required,
        type: "HOLD",
        description: `Hold ${required} credits for file ${fileId}`,
      },
    });

    await tx.uploadedFile.update({
      where: { id: fileId },
      data: {
        creditsCost: required,
      },
    });

    return { success: true, held: required };
  });
}

/**
 * Consome os créditos previamente reservados após sucesso na geração dos clipes.
 * - Em transação atômica: decrementa reservedCredits e registra CreditTransaction CONSUME.
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  fileId: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, reservedCredits: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        reservedCredits: { decrement: amount },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: "CONSUME",
        description: `Consume ${amount} credits for file ${fileId}`,
      },
    });
  });
}

/**
 * Estorna os créditos reservados em caso de falha no pipeline.
 * - Em transação atômica: devolve credits, decrementa reservedCredits,
 *   registra CreditTransaction REFUND e marca UploadedFile como failed com errorMessage.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  fileId: string,
  reason: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, reservedCredits: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount },
        reservedCredits: { decrement: amount },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: "REFUND",
        description: `Refund ${amount} credits for file ${fileId}: ${reason}`,
      },
    });

    await tx.uploadedFile.update({
      where: { id: fileId },
      data: {
        status: "failed",
        errorMessage: reason,
      },
    });
  });
}

export const CreditService = {
  holdCredits,
  consumeCredits,
  refundCredits,
};
