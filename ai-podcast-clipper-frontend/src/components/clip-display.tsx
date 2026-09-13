"use client";

import type { Clip } from "@prisma/client";
import { Film } from "lucide-react";
import { ClipCard } from "./clip-card";

export interface ClipDisplayProps {
  clips: Clip[];
  onDeleteClip?: (clipId: string) => void;
}

export function ClipDisplay({ clips, onDeleteClip }: ClipDisplayProps) {
  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--linha)] bg-[#0b0a08]/60 p-12 text-center">
        <Film className="mb-3 h-10 w-10 text-[var(--ouro)] opacity-40" />
        <h3 className="text-base font-medium text-[var(--marfim)]">Nenhum clipe gerado ainda</h3>
        <p className="mt-1 text-sm text-[var(--fumaca)] max-w-sm">
          Envie um arquivo de vídeo ou importe um link do YouTube para começar a gerar clipes virais.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} onDelete={onDeleteClip} />
      ))}
    </div>
  );
}
