import {
  makeConsumeCreditsUseCase,
  makeHoldCreditsUseCase,
  makeRefundCreditsUseCase,
} from "~/infrastructure/factories/use-case-factories";

export interface HoldCreditsResult {
  success: boolean;
  held: number;
}

/**
 * Reserva créditos atômicos para o processamento de um vídeo.
 * Delega para o Caso de Uso HoldCreditsUseCase.
 */
export async function holdCredits(
  userId: string,
  durationSeconds: number,
  fileId: string
): Promise<HoldCreditsResult> {
  const useCase = makeHoldCreditsUseCase();
  const result = await useCase.execute({
    userId,
    durationSeconds,
    fileId,
  });

  return {
    success: result.success,
    held: result.heldCredits,
  };
}

/**
 * Consome os créditos previamente reservados após sucesso na geração dos clipes.
 * Delega para o Caso de Uso ConsumeCreditsUseCase.
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  fileId: string
): Promise<void> {
  const useCase = makeConsumeCreditsUseCase();
  await useCase.execute({
    userId,
    amount,
    fileId,
  });
}

/**
 * Estorna os créditos reservados em caso de falha no pipeline.
 * Delega para o Caso de Uso RefundCreditsUseCase.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  fileId: string,
  reason: string
): Promise<void> {
  const useCase = makeRefundCreditsUseCase();
  await useCase.execute({
    userId,
    amount,
    fileId,
    reason,
  });
}

export const CreditService = {
  holdCredits,
  consumeCredits,
  refundCredits,
};
