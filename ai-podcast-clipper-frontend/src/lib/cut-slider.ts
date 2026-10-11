/**
 * Regras puras do slider de dois pontos (início/fim) usado no Fatiador e no
 * editor de cortes manuais. Tudo em segundos inteiros.
 */

export type SecondsRange = [number, number];

/** Trecho mínimo: 1s (a cobrança mínima já é 1 crédito para qualquer trecho). */
export const MIN_RANGE_SECONDS = 1;

/** Padrão de um corte novo: 30s (bem abaixo do limite de 60s por corte). */
export const DEFAULT_CUT_SECONDS = 30;

/**
 * Normaliza o valor emitido pelo slider: garante 0 <= início < fim <= max,
 * trecho >= MIN_RANGE_SECONDS e, se `maxLength` for dado, trecho <=
 * `maxLength`. O ponto que NÃO foi movido acompanha quando o limite
 * estoura (comportamento "janela arrastável": nunca trava o arraste e o
 * resultado é sempre válido).
 */
export function normalizeRange(
  previous: SecondsRange,
  next: number[],
  max: number,
  maxLength?: number,
): SecondsRange {
  let start = Math.min(Math.max(0, Math.round(next[0] ?? 0)), max);
  let end = Math.min(Math.max(0, Math.round(next[1] ?? start)), max);
  const startMoved = start !== previous[0];

  if (end - start < MIN_RANGE_SECONDS) {
    if (startMoved) {
      end = Math.min(max, start + MIN_RANGE_SECONDS);
      start = Math.min(start, end - MIN_RANGE_SECONDS);
    } else {
      start = Math.max(0, end - MIN_RANGE_SECONDS);
      end = Math.max(end, start + MIN_RANGE_SECONDS);
    }
  }

  if (maxLength !== undefined && end - start > maxLength) {
    if (startMoved) end = start + maxLength;
    else start = end - maxLength;
  }
  return [Math.max(0, start), Math.min(max, end)];
}

/**
 * Posição inicial sugerida para um corte novo: começa onde o último corte
 * terminou (ou em 0) e dura DEFAULT_CUT_SECONDS, sem passar do fim do vídeo.
 */
export function defaultCutRange(
  lastEndSeconds: number,
  videoDurationSeconds: number,
): SecondsRange {
  const max = Math.max(MIN_RANGE_SECONDS, Math.floor(videoDurationSeconds));
  const start = Math.max(0, Math.min(lastEndSeconds, max - MIN_RANGE_SECONDS));
  const end = Math.min(start + DEFAULT_CUT_SECONDS, max);
  return [start, end];
}
