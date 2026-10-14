import { DomainError } from "./domain-error";

/**
 * Decisão de produto confirmada: um corte manual NOVO que se sobrepõe a um
 * clipe já existente do projeto é BLOQUEADO (rejeitado com erro claro), nunca
 * apenas avisado nem processado com sobreposição silenciosa. Lançado por
 * `AddClipsToProjectUseCase` ANTES de criar o lote/reservar crédito.
 */
export class ManualCutOverlapError extends DomainError {
  constructor(
    public readonly cutStartTime: number,
    public readonly cutEndTime: number,
    public readonly overlappingRangeStart: number,
    public readonly overlappingRangeEnd: number
  ) {
    super(
      `O corte de ${Math.floor(cutStartTime)}s a ${Math.floor(cutEndTime)}s se sobrepõe a um clipe já existente deste projeto (${Math.floor(overlappingRangeStart)}s–${Math.floor(overlappingRangeEnd)}s). Ajuste os tempos e tente novamente.`
    );
  }
}
