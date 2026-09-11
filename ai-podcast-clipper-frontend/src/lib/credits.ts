/**
 * RN-01: Cálculo de Custo de Vídeo
 * O custo de processamento é fixado em ceil(duration_seconds / 60) créditos.
 * Mínimo de 1 crédito.
 */
export function calculateVideoCredits(durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}
