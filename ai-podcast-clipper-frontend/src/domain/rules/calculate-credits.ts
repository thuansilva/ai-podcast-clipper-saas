/**
 * Regra RN-01: Cálculo de Custo por Duração de Vídeo
 * - Cada minuto (ou fração de minuto) custa 1 crédito.
 * - Vídeos de duração <= 0 segundos têm piso mínimo de 1 crédito.
 */
export function calculateVideoCredits(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

export interface ManualCutDurationItem {
  startTime: number;
  endTime: number;
}

/**
 * Regra: Cálculo de Créditos para Cortes Manuais
 * - Se lista vazia ou nula, retorna 0.
 * - Para cada corte: duração = Math.max(0, cut.endTime - cut.startTime).
 * - Se duração === 0, adiciona 0.
 * - Caso contrário, cada fração de até 60 segundos custa 1 crédito: Math.max(1, Math.ceil(duration / 60)).
 * - Retorna a soma de todos os cortes.
 */
export function calculateManualCutsCredits(cuts: ManualCutDurationItem[]): number {
  if (!cuts || cuts.length === 0) {
    return 0;
  }

  return cuts.reduce((totalCredits, cut) => {
    const duration = Math.max(0, cut.endTime - cut.startTime);
    if (duration === 0) {
      return totalCredits;
    }
    const credits = Math.max(1, Math.ceil(duration / 60));
    return totalCredits + credits;
  }, 0);
}

