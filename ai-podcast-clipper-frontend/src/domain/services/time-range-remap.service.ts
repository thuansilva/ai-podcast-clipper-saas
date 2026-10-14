import type { TimeRangeDTO } from "~/application/dtos/video-dtos";

/**
 * Domain Service: conversão de tempos entre o vídeo ORIGINAL e o arquivo
 * baixado/concatenado de um lote de "adicionar mais cortes" (modo IA/auto).
 *
 * Espelha, para o slice de IA, a mesma relação que o backend já devolve
 * para cortes manuais via `remapped_ranges`/`remapped_cuts`
 * (`core/schemas.py::RemappedTimeRange`/`RemappedManualCut`): o range
 * baixado é um único merge (com margem) do slice pedido, descrito por
 * `{ original_start, original_end, offset_in_output }`. Qualquer instante
 * `t` dentro de `[original_start, original_end]` corresponde, no arquivo de
 * saída, a `offset_in_output + (t - original_start)` — e a conversão
 * inversa é só isolar `t`.
 */
export interface MergedRangeOffset {
  original_start: number;
  original_end: number;
  offset_in_output: number;
}

/** Converte um intervalo no tempo ORIGINAL para o tempo do arquivo de saída
 * (ex.: `excludedRanges` antes de enviar ao backend em `/process_video`). */
export function remapOriginalRangeToOutput(
  range: TimeRangeDTO,
  mergedRange: MergedRangeOffset
): TimeRangeDTO {
  const toOutput = (t: number): number =>
    mergedRange.offset_in_output + (t - mergedRange.original_start);
  return {
    start: toOutput(range.start),
    end: toOutput(range.end),
  };
}

/** Converte um instante no tempo do arquivo de saída de volta para o tempo
 * ORIGINAL (ex.: tempos dos clipes devolvidos pelo Modal/GPU, para
 * persistir em `Clip.sourceStartTime`/`sourceEndTime`). */
export function remapOutputTimeToOriginal(
  t: number,
  mergedRange: MergedRangeOffset
): number {
  return mergedRange.original_start + (t - mergedRange.offset_in_output);
}
