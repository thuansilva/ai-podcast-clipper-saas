import { DomainError } from "./domain-error";

/**
 * Espelho, no consumidor, de RN-PIPE-MANUAL-03 (backend rejeita
 * `mode="auto"` + `manual_cuts`): cortes manuais sem `mode="manual"` são uma
 * combinação ambígua. Como o payload do GPU deriva o modo da PRESENÇA de
 * cortes (D6) e a cobrança usa o `mode` do evento, aceitar essa combinação
 * reservaria crédito pelo preço automático enquanto o backend processa todos
 * os cortes em modo manual. Lançado ANTES da reserva de créditos.
 */
export class ManualCutsModeMismatchError extends DomainError {
  constructor() {
    super(
      "Cortes manuais só podem ser enviados com o modo de corte manual (mode='manual')."
    );
  }
}
