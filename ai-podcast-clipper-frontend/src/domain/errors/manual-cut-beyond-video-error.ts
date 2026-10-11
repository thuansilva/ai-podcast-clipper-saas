import { DomainError } from "./domain-error";

/**
 * RN-PIPE-MANUAL-17: no modo manual, nenhum corte pode terminar depois do
 * fim do vídeo. Detectado no Inngest (que já conhece a duração após o
 * download) ANTES de reservar créditos; o backend mantém a mesma checagem
 * (422) como segunda camada.
 *
 * Não reintentável: o handler `processVideoHandler` captura qualquer erro,
 * marca o arquivo como failed e retorna `success: false` sem relançar, então
 * o Inngest nunca reexecuta o passo (o projeto não usa `NonRetriableError`).
 */
export class ManualCutBeyondVideoError extends DomainError {
  constructor(
    public readonly cutEndTime: number,
    public readonly videoDurationSeconds: number,
  ) {
    super(
      `Um dos cortes termina em ${Math.ceil(cutEndTime)}s, além da duração do vídeo (${Math.floor(videoDurationSeconds)}s). Ajuste os cortes e tente novamente.`,
    );
  }
}
