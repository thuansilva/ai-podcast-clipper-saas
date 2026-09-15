export interface ManualCutDurationItem {
  startTime: number;
  endTime: number;
}

/**
 * Domain Service: CreditPricingService
 * Centraliza a política e as regras de tarifação de processamento por créditos:
 * - RN-01: Cálculo de Custo por Duração de Vídeo (1 crédito por minuto/fração, mín. 1)
 * - Cálculo de créditos para cortes manuais
 */
export class CreditPricingService {
  /**
   * Calcula o custo em créditos para processar um vídeo inteiro.
   */
  public static calculateVideoCredits(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(durationSeconds / 60));
  }

  /**
   * Calcula o custo em créditos para uma lista de cortes manuais.
   */
  public static calculateManualCutsCredits(cuts: ManualCutDurationItem[]): number {
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
}

// Funções de conveniência delegadas ao Domain Service
export const calculateVideoCredits = (durationSeconds: number): number =>
  CreditPricingService.calculateVideoCredits(durationSeconds);

export const calculateManualCutsCredits = (cuts: ManualCutDurationItem[]): number =>
  CreditPricingService.calculateManualCutsCredits(cuts);
