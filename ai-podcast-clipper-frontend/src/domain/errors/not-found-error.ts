import { DomainError } from "./domain-error";

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier
        ? `${resource} com identificador '${identifier}' não foi encontrado.`
        : `${resource} não encontrado.`
    );
  }
}
