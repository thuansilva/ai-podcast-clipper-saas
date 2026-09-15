/**
 * Constantes de limites por plano de usuário e arquivo
 */
export const NORMAL_MAX_DURATION_SECONDS = 2 * 60 * 60; // 7.200 segundos (2h)
export const STUDIO_MAX_DURATION_SECONDS = 3 * 60 * 60; // 10.800 segundos (3h)
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export interface VideoDurationValidationResult {
  valid: boolean;
  maxAllowedSeconds: number;
  error?: string;
}

export interface FileSizeValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Domain Service: PlanPolicyService
 * Centraliza as regras de limites de processamento por plano de assinatura.
 */
export class PlanPolicyService {
  /**
   * Retorna o limite máximo de duração em segundos para o plano especificado.
   */
  public static getMaxDurationForPlan(plan?: string | null): number {
    if (!plan) return NORMAL_MAX_DURATION_SECONDS;
    const normalized = plan.trim().toUpperCase();
    if (normalized === "STUDIO" || normalized === "PRO_STUDIO") {
      return STUDIO_MAX_DURATION_SECONDS;
    }
    return NORMAL_MAX_DURATION_SECONDS;
  }

  /**
   * Valida se a duração de um vídeo em segundos respeita o limite do plano do usuário.
   */
  public static validateVideoDuration(
    durationSeconds: number,
    plan?: string | null
  ): VideoDurationValidationResult {
    const maxAllowed = PlanPolicyService.getMaxDurationForPlan(plan);
    const isStudio = maxAllowed === STUDIO_MAX_DURATION_SECONDS;

    if (durationSeconds > maxAllowed) {
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const durationFormatted =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutos`;

      const errorMessage = isStudio
        ? `O vídeo possui ${durationFormatted} e excede o limite máximo permitido de 3h para o plano Studio.`
        : `O vídeo possui ${durationFormatted} e excede o limite de 2h do seu plano. Faça upgrade para o plano Studio para vídeos de até 3h.`;

      return {
        valid: false,
        maxAllowedSeconds: maxAllowed,
        error: errorMessage,
      };
    }

    return {
      valid: true,
      maxAllowedSeconds: maxAllowed,
    };
  }

  /**
   * Valida se o tamanho do arquivo em bytes respeita o limite do sistema (2 GB).
   */
  public static validateFileSize(fileSizeBytes: number): FileSizeValidationResult {
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: "O arquivo selecionado é muito grande. O limite máximo permitido é de 2 GB por arquivo.",
      };
    }

    return {
      valid: true,
    };
  }
}

// Funções e constantes de conveniência delegadas ao Domain Service
export const getMaxDurationForPlan = (plan?: string | null): number =>
  PlanPolicyService.getMaxDurationForPlan(plan);

export const validateVideoDuration = (
  durationSeconds: number,
  plan?: string | null
): VideoDurationValidationResult =>
  PlanPolicyService.validateVideoDuration(durationSeconds, plan);

export const validateFileSize = (fileSizeBytes: number): FileSizeValidationResult =>
  PlanPolicyService.validateFileSize(fileSizeBytes);
