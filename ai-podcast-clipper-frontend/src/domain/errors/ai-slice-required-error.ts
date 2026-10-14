import { DomainError } from "./domain-error";

/**
 * Espelho de `ManualCutsRequiredError` para o modo "IA gera mais"
 * (`AddClipsToProjectUseCase`, `mode === "auto"`): exige um slice novo
 * válido (`endTime > startTime`) para a IA analisar. Nunca cai
 * silenciosamente para reanalisar o vídeo inteiro.
 */
export class AiSliceRequiredError extends DomainError {
  constructor() {
    super(
      "Modo 'IA gera mais' requer um trecho (slice) novo válido para analisar."
    );
  }
}
