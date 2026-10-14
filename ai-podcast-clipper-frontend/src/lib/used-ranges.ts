/**
 * Helpers de exibição para os intervalos (segundos, absolutos no vídeo
 * ORIGINAL) já usados por clipes existentes de um projeto — usado pelo
 * fluxo de "Adicionar mais cortes" (`AddClipsToProjectClient`) para marcar
 * visualmente, no Fatiador/editor de cortes, trechos que já foram
 * processados antes.
 *
 * A validação de BLOQUEIO em si (corte novo sobreposto a um clipe
 * existente) usa `TimeRange`/`findOverlappingRange` de
 * `~/domain/services/range-overlap.service` diretamente — este módulo só
 * acrescenta o que é puramente apresentação (mesclar intervalos para
 * desenhar a trilha, sem duplicar a regra de negócio).
 */
import type { TimeRange } from "~/domain/services/range-overlap.service";

export type { TimeRange };

/**
 * Mescla intervalos sobrepostos ou encostados (`current.start <= last.end`),
 * ordenados por início. Usado apenas para a trilha visual de "trechos já
 * usados" — nunca para decidir bloqueio (que compara contra os intervalos
 * originais, um por clipe, para mensagens de erro precisas).
 */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges]
    .map((r) => ({ ...r }))
    .sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
}
