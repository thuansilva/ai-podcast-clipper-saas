/**
 * Utilitários de domínio para parsing, formatação e validação de timestamps de cortes manuais.
 */

/**
 * Converte string MM:SS ou HH:MM:SS para segundos inteiros.
 * Retorna null para valores nulos, vazios ou formatos inválidos.
 */
export function parseTimestampToSeconds(value: string): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts as [number, number];
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts as [number, number, number];
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

/**
 * Converte segundos inteiros para string no formato MM:SS ou HH:MM:SS.
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !Number.isFinite(seconds)) return "00:00";
  const rounded = Math.floor(seconds);

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Adiciona segundos a um timestamp existente.
 */
export function addSecondsToTimestamp(
  currentTimestamp: string,
  deltaSeconds: number
): string {
  const currentSeconds = parseTimestampToSeconds(currentTimestamp) ?? 0;
  const targetSeconds = Math.max(0, currentSeconds + deltaSeconds);
  return formatSecondsToTimestamp(targetSeconds);
}

/**
 * Valida se um corte manual atende aos critérios do sistema.
 */
export function validateManualCut(
  startSeconds: number,
  endSeconds: number,
  maxVideoDuration?: number
): { valid: boolean; error?: string } {
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
