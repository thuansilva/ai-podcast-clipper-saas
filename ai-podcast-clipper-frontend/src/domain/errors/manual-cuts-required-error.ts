import { DomainError } from "./domain-error";

/**
 * RN-PIPE-MANUAL-02 / D5: `mode="manual"` exige ao menos um corte manual.
 * Diferente do comportamento legado (que caía silenciosamente para o
 * cálculo automático de créditos quando `manualCuts` vinha vazio), isso é
 * tratado como um erro explícito — o crédito, nesse ponto do pipeline,
 * ainda não foi reservado no preço manual nem no automático, então falhar
 * aqui (antes do hold) evita tanto o fallback silencioso quanto uma cobrança
 * incorreta.
 */
export class ManualCutsRequiredError extends DomainError {
  constructor() {
    super(
      "Modo de corte manual requer ao menos um corte manual (manual_cuts vazio ou ausente)."
    );
  }
}
