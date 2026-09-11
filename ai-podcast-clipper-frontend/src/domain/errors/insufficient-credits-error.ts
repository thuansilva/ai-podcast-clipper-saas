import { DomainError } from "./domain-error";

export class InsufficientCreditsError extends DomainError {
  constructor(
    public readonly required: number,
    public readonly available: number
  ) {
    super(
      `Saldo insuficiente de créditos: necessários ${required}, disponíveis ${available}.`
    );
  }
}
