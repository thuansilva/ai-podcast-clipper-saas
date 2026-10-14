import {
  remapOutputTimeToOriginal,
  type MergedRangeOffset,
} from "~/domain/services/time-range-remap.service";

/**
 * Domain Service: tempo de um clipe no vídeo ORIGINAL (`Clip.sourceStartTime`
 * / `sourceEndTime`), a partir dos tempos devolvidos pelo Modal/GPU — que são
 * sempre relativos ao arquivo que de fato foi processado.
 *
 * Compartilhado entre o fluxo normal (`processVideoHandler`) e o de
 * "adicionar mais cortes" (`appendClipsToProjectHandler`). Nunca inventa
 * valor: quando não há como saber o tempo original com certeza, devolve
 * `null` (e o projeto fica bloqueado para "adicionar cortes", em vez de
 * aceitar sobreposições erradas).
 */
export interface RemappedCutTimes {
  original_start: number;
  original_end: number;
  new_start: number;
  new_end: number;
}

export type ClipSourceRemap =
  /** Arquivo processado = vídeo original inteiro (upload direto, ou YouTube
   * baixado por completo no modo automático). */
  | { kind: "identity" }
  /** Arquivo processado = um único range (com margem) do original — slice
   * de IA do "adicionar mais cortes". */
  | { kind: "merged-range"; mergedRange: MergedRangeOffset | undefined }
  /** Arquivo processado = concatenação dos cortes manuais; casa cada clipe
   * pelo par `new_start`/`new_end` devolvido em `remapped_cuts`. */
  | { kind: "remapped-cuts"; cuts: RemappedCutTimes[] | undefined };

export interface ClipSourceRange {
  sourceStartTime: number | null;
  sourceEndTime: number | null;
}

const MATCH_TOLERANCE_SECONDS = 0.5;

export function resolveClipSourceRange(
  clip: { start: number; end: number },
  remap: ClipSourceRemap,
): ClipSourceRange {
  switch (remap.kind) {
    case "identity":
      return { sourceStartTime: clip.start, sourceEndTime: clip.end };
    case "merged-range":
      if (!remap.mergedRange) return { sourceStartTime: null, sourceEndTime: null };
      return {
        sourceStartTime: remapOutputTimeToOriginal(clip.start, remap.mergedRange),
        sourceEndTime: remapOutputTimeToOriginal(clip.end, remap.mergedRange),
      };
    case "remapped-cuts": {
      const matched = remap.cuts?.find(
        (cut) =>
          Math.abs(cut.new_start - clip.start) < MATCH_TOLERANCE_SECONDS &&
          Math.abs(cut.new_end - clip.end) < MATCH_TOLERANCE_SECONDS,
      );
      return matched
        ? { sourceStartTime: matched.original_start, sourceEndTime: matched.original_end }
        : { sourceStartTime: null, sourceEndTime: null };
    }
  }
}
