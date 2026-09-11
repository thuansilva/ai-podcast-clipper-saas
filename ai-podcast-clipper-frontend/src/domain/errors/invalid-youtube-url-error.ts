import { DomainError } from "./domain-error";

export class InvalidYouTubeUrlError extends DomainError {
  constructor(url: string) {
    super(
      `A URL '${url}' não é um link válido ou suportado do YouTube.`
    );
  }
}
