import { DomainError } from "../errors/domain-error";
import { formatSecondsToTimestamp } from "./timestamp.vo";

export interface VideoCutValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Value Object: VideoCut
 * Encapsula as regras e invariantes de um corte manual de vídeo:
 * - Início não negativo
 * - Término estritamente maior que início
 * - Duração mínima de 5 segundos e máxima de 180 segundos
 * - Não pode ultrapassar a duração total do vídeo (se informada)
 */
export class VideoCut {
  public readonly startSeconds: number;
  public readonly endSeconds: number;

  private constructor(startSeconds: number, endSeconds: number) {
    this.startSeconds = startSeconds;
    this.endSeconds = endSeconds;
  }

  public static validate(
    startSeconds: number,
    endSeconds: number,
    maxVideoDuration?: number
  ): VideoCutValidationResult {
    if (isNaN(startSeconds) || isNaN(endSeconds)) {
      return { valid: false, error: "Valores de tempo inválidos." };
    }

    if (startSeconds < 0) {
      return { valid: false, error: "O tempo de início não pode ser negativo." };
    }

    if (endSeconds <= startSeconds) {
      return {
        valid: false,
        error: "O tempo final deve ser maior que o tempo inicial.",
      };
    }

    const duration = endSeconds - startSeconds;
    if (duration < 5) {
      return {
        valid: false,
        error: "A duração mínima de um corte é de 5 segundos.",
      };
    }

    if (duration > 180) {
      return {
        valid: false,
        error: "A duração máxima de um corte manual é de 180 segundos.",
      };
    }

    if (maxVideoDuration !== undefined && endSeconds > maxVideoDuration) {
      return {
        valid: false,
        error: `O corte ultrapassa a duração total do vídeo (${formatSecondsToTimestamp(
          maxVideoDuration
        )}).`,
      };
    }

    return { valid: true };
  }

  public static create(
    startSeconds: number,
    endSeconds: number,
    maxVideoDuration?: number
  ): VideoCut {
    const validation = VideoCut.validate(startSeconds, endSeconds, maxVideoDuration);
    if (!validation.valid) {
      throw new DomainError(validation.error ?? "Corte de vídeo inválido.");
    }
    return new VideoCut(startSeconds, endSeconds);
  }

  public get durationSeconds(): number {
    return Math.max(0, this.endSeconds - this.startSeconds);
  }

  public calculateCredits(): number {
    if (this.durationSeconds === 0) return 0;
    return Math.max(1, Math.ceil(this.durationSeconds / 60));
  }

  public equals(other: VideoCut): boolean {
    return (
      this.startSeconds === other.startSeconds &&
      this.endSeconds === other.endSeconds
    );
  }
}

// Função de conveniência delegada para retrocompatibilidade
export const validateManualCut = (
  startSeconds: number,
  endSeconds: number,
  maxVideoDuration?: number
): VideoCutValidationResult =>
  VideoCut.validate(startSeconds, endSeconds, maxVideoDuration);
