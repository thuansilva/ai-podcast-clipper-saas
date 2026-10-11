import type { ManualCutDTO } from "~/application/dtos/video-dtos";
import {
  MAX_MANUAL_CUT_DURATION_SECONDS,
} from "~/domain/schemas/manual-cut.schema";
import { parseTimeInput } from "~/lib/time-format";

/** Linha do editor de cortes: valores crus digitados pelo usuário. */
export interface ManualCutRow {
  id: string;
  start: string;
  end: string;
  title: string;
}

export interface ManualCutRowAnalysis {
  startError: string | null;
  endError: string | null;
  titleError: string | null;
  /** Aviso não bloqueante (sobreposição com outro corte). */
  overlapWarning: string | null;
  /** Início ou fim ainda vazio: não é erro visível, mas bloqueia o envio. */
  incomplete: boolean;
}

export interface ManualCutRowsAnalysis {
  rows: ManualCutRowAnalysis[];
  /** Cortes válidos, em segundos absolutos no vídeo inteiro. */
  cuts: ManualCutDTO[];
  /** Há ao menos uma linha e todas são válidas e completas. */
  allValid: boolean;
}

const FORMAT_ERROR = "Formato inválido. Use mm:ss ou h:mm:ss.";
const MAX_TITLE_LENGTH = 200;

/**
 * Valida as linhas do editor contra as regras compartilhadas com o schema
 * de borda (`manual-cut.schema.ts`) e contra a duração real do vídeo (o
 * backend só rejeita isso depois do download, com crédito já reservado).
 */
export function analyzeManualCutRows(
  rows: ManualCutRow[],
  videoDurationSeconds: number,
): ManualCutRowsAnalysis {
  const parsed = rows.map((row) => ({
    start: parseTimeInput(row.start),
    end: parseTimeInput(row.end),
  }));

  const analyses: ManualCutRowAnalysis[] = rows.map((row, i) => {
    const { start, end } = parsed[i]!;
    const startText = row.start.trim();
    const endText = row.end.trim();
    let startError: string | null = null;
    let endError: string | null = null;
    let titleError: string | null = null;

    if (startText && start === null) startError = FORMAT_ERROR;
    else if (start !== null && start >= videoDurationSeconds) {
      startError = "O início está depois do fim da duração do vídeo.";
    }

    if (endText && end === null) endError = FORMAT_ERROR;
    else if (end !== null) {
      if (start !== null && end <= start) {
        endError = "O fim deve ser depois do início.";
      } else if (start !== null && end - start > MAX_MANUAL_CUT_DURATION_SECONDS) {
        endError = `O corte pode ter no máximo ${MAX_MANUAL_CUT_DURATION_SECONDS}s.`;
      } else if (end > videoDurationSeconds) {
        endError = "O fim passa da duração do vídeo.";
      }
    }

    if (row.title.trim().length > MAX_TITLE_LENGTH) {
      titleError = `O título pode ter no máximo ${MAX_TITLE_LENGTH} caracteres.`;
    }

    return {
      startError,
      endError,
      titleError,
      overlapWarning: null,
      incomplete: !startText || !endText,
    };
  });

  const validIndexes: number[] = [];
  rows.forEach((_, i) => {
    const a = analyses[i]!;
    const p = parsed[i]!;
    if (!a.incomplete && !a.startError && !a.endError && !a.titleError && p.start !== null && p.end !== null) {
      validIndexes.push(i);
    }
  });

  // Sobreposição: apenas entre cortes válidos; encostar (fim == início) não conta.
  const overlaps = new Map<number, number[]>();
  for (let x = 0; x < validIndexes.length; x++) {
    for (let y = x + 1; y < validIndexes.length; y++) {
      const i = validIndexes[x]!;
      const j = validIndexes[y]!;
      const a = parsed[i]!;
      const b = parsed[j]!;
      if (a.start! < b.end! && b.start! < a.end!) {
        overlaps.set(i, [...(overlaps.get(i) ?? []), j + 1]);
        overlaps.set(j, [...(overlaps.get(j) ?? []), i + 1]);
      }
    }
  }
  overlaps.forEach((others, i) => {
    const list = others.map((n) => `corte ${n}`).join(", ");
    analyses[i]!.overlapWarning = `Sobrepõe o ${list}. Os trechos em comum serão processados duas vezes.`;
  });

  const cuts: ManualCutDTO[] = validIndexes.map((i) => {
    const row = rows[i]!;
    const title = row.title.trim();
    const cut: ManualCutDTO = {
      id: row.id,
      startTime: parsed[i]!.start!,
      endTime: parsed[i]!.end!,
    };
    if (title) cut.title = title;
    return cut;
  });

  return {
    rows: analyses,
    cuts,
    allValid: rows.length > 0 && validIndexes.length === rows.length,
  };
}
