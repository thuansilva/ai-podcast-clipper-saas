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

  /**
   * Calcula quantos créditos de assinatura devem ser revogados quando o
   * Stripe reembolsa (`charge.refunded`) ou contesta (`charge.dispute.created`)
   * uma cobrança — proporcionalmente à fração do preço mensal que foi
   * efetivamente reembolsada/disputada.
   *
   * Ex.: plano Starter ($15,00/mês = 1500 centavos, 150 créditos/mês) com
   * um reembolso parcial de 750 centavos (metade do preço) revoga 75
   * créditos (metade da cota mensal).
   *
   * O resultado nunca excede `monthlyCredits` (não é possível revogar mais
   * créditos do que a cota do próprio período) e é sempre >= 1 quando o
   * valor reembolsado é positivo, para garantir que todo reembolso tenha
   * efeito perceptível no saldo.
   */
  public static calculateCreditsToRevokeForRefund(
    refundAmountCents: number,
    monthlyPriceCents: number,
    monthlyCredits: number
  ): number {
    if (refundAmountCents <= 0 || monthlyPriceCents <= 0 || monthlyCredits <= 0) {
      return 0;
    }

    const proportion = Math.min(1, refundAmountCents / monthlyPriceCents);
    return Math.min(monthlyCredits, Math.max(1, Math.round(proportion * monthlyCredits)));
  }
}

// Funções de conveniência delegadas ao Domain Service
export const calculateVideoCredits = (durationSeconds: number): number =>
  CreditPricingService.calculateVideoCredits(durationSeconds);

export const calculateManualCutsCredits = (cuts: ManualCutDurationItem[]): number =>
  CreditPricingService.calculateManualCutsCredits(cuts);
