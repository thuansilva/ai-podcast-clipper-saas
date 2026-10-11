import { ManualCutBeyondVideoError } from "../errors/manual-cut-beyond-video-error";

export interface CutRange {
  startTime: number;
  endTime: number;
}

export interface EffectiveDurationInput {
  isManual: boolean;
  manualCuts?: CutRange[];
  sliceStartTime?: number | null;
  sliceEndTime?: number | null;
  videoDurationSeconds: number;
}

/**
 * Duração que vale para o limite do plano e para a reserva de créditos.
 * - Manual: soma das durações dos cortes (o custo é proporcional aos cortes).
 * - Automático com trecho do Fatiador: tamanho do trecho.
 * - Automático sem trecho: duração do vídeo inteiro.
 */
export function computeEffectiveProcessingDuration(
  input: EffectiveDurationInput,
): number {
  if (input.isManual) {
    return (input.manualCuts ?? []).reduce(
      (total, cut) => total + Math.max(0, cut.endTime - cut.startTime),
      0,
    );
  }
  const start = input.sliceStartTime ?? 0;
  const end = input.sliceEndTime ?? 0;
  return end && end > start ? end - start : input.videoDurationSeconds;
}

/** RN-PIPE-MANUAL-17: falha cedo se algum corte termina após o fim do vídeo. */
export function assertManualCutsWithinVideo(
  cuts: CutRange[],
  videoDurationSeconds: number,
): void {
  for (const cut of cuts) {
    if (cut.endTime > videoDurationSeconds) {
      throw new ManualCutBeyondVideoError(cut.endTime, videoDurationSeconds);
    }
  }
}
