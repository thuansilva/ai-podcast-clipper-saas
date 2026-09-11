import { DomainError } from "./domain-error";

export class UnauthorizedError extends DomainError {
  constructor(message = "Acesso não autorizado a este recurso.") {
    super(message);
  }
}
