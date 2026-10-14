/**
 * Domain Service: operações puras sobre intervalos de tempo (segundos,
 * sempre no mesmo referencial — quem chama decide se é o vídeo original ou
 * um arquivo baixado/concatenado). Usado por `AddClipsToProjectUseCase` para:
 * - bloquear cortes manuais novos que colidem com clipes já existentes;
 * - calcular quais intervalos já usados caem dentro do slice de IA escolhido
 *   (enviados ao backend como `excludedRanges`).
 */
export interface TimeRange {
  start: number;
  end: number;
}

/** Dois intervalos se sobrepõem se houver qualquer segundo em comum. Dois
 * intervalos apenas "encostados" (ex.: [0,10] e [10,20]) NÃO se sobrepõem. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Primeiro intervalo de `existing` que se sobrepõe a `candidate`, ou
 * `undefined` se nenhum se sobrepuser. */
export function findOverlappingRange(
  candidate: TimeRange,
  existing: TimeRange[]
): TimeRange | undefined {
  return existing.find((range) => rangesOverlap(candidate, range));
}

/**
 * Intervalos de `existing` que caem (total ou parcialmente) dentro de
 * `container`, já recortados (clamped) aos limites de `container`. Usado
 * para calcular `excludedRanges`: dos intervalos já usados pelo projeto,
 * somente a parte que cai dentro do slice novo escolhido pela IA interessa
 * ao backend.
 */
export function clipRangesToContainer(
  existing: TimeRange[],
  container: TimeRange
): TimeRange[] {
  return existing
    .filter((range) => rangesOverlap(range, container))
    .map((range) => ({
      start: Math.max(range.start, container.start),
      end: Math.min(range.end, container.end),
    }));
}
