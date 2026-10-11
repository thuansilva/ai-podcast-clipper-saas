/**
 * Conversão entre texto humano de tempo ("mm:ss" ou "h:mm:ss") e segundos.
 * Funções puras, sem dependência de React, usadas pelo editor de cortes manuais.
 */

const TWO_PART = /^(\d{1,3}):(\d{2})$/;
const THREE_PART = /^(\d{1,2}):(\d{2}):(\d{2})$/;

/**
 * Converte "mm:ss" (minutos podem passar de 59, ex. "75:00") ou "h:mm:ss"
 * para segundos. Segundos e, no formato com horas, minutos precisam estar
 * entre 00 e 59. Retorna `null` para qualquer entrada inválida.
 */
export function parseTimeInput(input: string): number | null {
  const text = input.trim();

  const two = TWO_PART.exec(text);
  if (two) {
    const minutes = Number(two[1]);
    const seconds = Number(two[2]);
    if (seconds > 59) return null;
    return minutes * 60 + seconds;
  }

  const three = THREE_PART.exec(text);
  if (three) {
    const hours = Number(three[1]);
    const minutes = Number(three[2]);
    const seconds = Number(three[3]);
    if (minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

/** Formata segundos como "mm:ss" (ou "h:mm:ss" a partir de 1h). */
export function formatTimeInput(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
