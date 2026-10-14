"use client";

import { formatTimeInput } from "~/lib/time-format";
import { mergeRanges, type TimeRange } from "~/lib/used-ranges";

interface UsedRangesTrackProps {
  /** Intervalos (segundos, absolutos no vídeo ORIGINAL) já usados por
   * clipes existentes do projeto. */
  usedRanges: TimeRange[];
  /** Duração total do vídeo original, em segundos — usada para converter
   * os intervalos em posições percentuais na trilha. */
  max: number;
}

/**
 * Trilha visual (não interativa) que marca, abaixo de um slider de
 * segundos, quais trechos do vídeo original já foram usados por clipes
 * existentes — para o usuário NUNCA tentar cortar em cima deles, mesmo que
 * o backend já bloqueie (`ManualCutOverlapError`). A lista textual abaixo
 * da trilha é sempre visível (não só para leitor de tela): números exatos
 * importam mais aqui do que uma barra colorida sozinha.
 */
export function UsedRangesTrack({ usedRanges, max }: UsedRangesTrackProps) {
  if (max <= 0) return null;
  const merged = mergeRanges(usedRanges);

  return (
    <div className="space-y-1.5">
      <div
        data-testid="used-ranges-track"
        aria-hidden="true"
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--superficie-2)]"
      >
        {merged.map((range, i) => {
          const start = Math.max(0, Math.min(range.start, max));
          const end = Math.max(start, Math.min(range.end, max));
          const left = (start / max) * 100;
          const width = ((end - start) / max) * 100;
          return (
            <div
              key={i}
              data-testid="used-range-segment"
              className="absolute top-0 h-full bg-red-500/70"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
      {merged.length > 0 && (
        <p className="text-xs text-[var(--fumaca)]">
          <span className="font-medium text-red-400">Já usado por cortes existentes: </span>
          {merged
            .map((range) => `${formatTimeInput(range.start)}–${formatTimeInput(range.end)}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
