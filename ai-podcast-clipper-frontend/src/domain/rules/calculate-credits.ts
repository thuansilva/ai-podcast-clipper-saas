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
