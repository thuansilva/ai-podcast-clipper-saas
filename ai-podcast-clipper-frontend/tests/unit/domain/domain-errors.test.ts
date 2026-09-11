import { describe, it, expect } from "vitest";
import { DomainError } from "~/domain/errors/domain-error";
import { InsufficientCreditsError } from "~/domain/errors/insufficient-credits-error";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { InvalidYouTubeUrlError } from "~/domain/errors/invalid-youtube-url-error";

describe("Domain Errors", () => {
  it("InsufficientCreditsError deve herdar de DomainError e conter detalhes", () => {
    const error = new InsufficientCreditsError(5, 2);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.required).toBe(5);
    expect(error.available).toBe(2);
    expect(error.message).toContain("necessários 5, disponíveis 2");
  });

  it("NotFoundError deve herdar de DomainError e formatar mensagem", () => {
    const error = new NotFoundError("Vídeo", "vid-123");
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toBe(
      "Vídeo com identificador 'vid-123' não foi encontrado."
    );
  });

  it("UnauthorizedError deve herdar de DomainError", () => {
    const error = new UnauthorizedError();
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toBe("Acesso não autorizado a este recurso.");
  });

  it("InvalidYouTubeUrlError deve herdar de DomainError", () => {
    const error = new InvalidYouTubeUrlError("https://invalid.com");
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toContain("não é um link válido");
  });
});
