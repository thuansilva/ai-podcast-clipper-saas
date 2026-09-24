"use client";

import type { Clip } from "@prisma/client";
import { Info, Loader2, Play, Flame, X, Check, Lightbulb } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CustomVideoPlayer } from "./custom-video-player";

export interface ClipDetailsModalProps {
  clip: Clip;
  playUrl: string | null;
  isLoadingUrl: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function ClipDetailsModal({
  clip,
  playUrl,
  isLoadingUrl,
  isOpen,
  onClose,
}: ClipDetailsModalProps) {
  if (!isOpen) return null;

  // Format time interval
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const startTimeStr = formatTime(clip.startTime);
  const endTimeStr = formatTime(clip.endTime);
  const interval = `${startTimeStr} - ${endTimeStr}`;

  // Parse words
  let transcriptionText = "Transcrição não disponível.";
  if (clip.transcriptWords && Array.isArray(clip.transcriptWords) && clip.transcriptWords.length > 0) {
    try {
      const wordsArray = clip.transcriptWords as Array<{ word: string }>;
      transcriptionText = wordsArray.map((w) => w.word).join(" ");
    } catch {
      // ignore
    }
  } else if (clip.hook) {
    transcriptionText = clip.hook; // fallback to hook if transcript is absent
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-[var(--marfim)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--linha)] pb-4">
          <div>
            <h2
              id="clip-details-title"
              className="text-xl font-semibold flex items-center gap-2 text-[var(--marfim)]"
            >
              <Info className="h-5 w-5 text-[var(--ouro)]" />
              Detalhes do Clipe
            </h2>
            <p className="text-sm text-[var(--fumaca)] mt-1">
              Visualize o trecho de vídeo, transcrição completa e os motivos da seleção.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fechar"
            className="h-8 w-8 p-0 text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--superficie-2)] rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-6 py-6 h-full">
          {/* Left Column: Video */}
          <div className="w-full md:w-[320px] shrink-0">
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-[var(--tinta)] border border-[var(--linha)] flex items-center justify-center">
              {isLoadingUrl ? (
                <Loader2 className="h-8 w-8 animate-spin text-[var(--fumaca)]" />
              ) : playUrl ? (
                <CustomVideoPlayer src={playUrl} />
              ) : (
                <div className="flex flex-col items-center justify-center text-[var(--fumaca)]">
                  <Play className="h-10 w-10 opacity-40 text-[var(--ouro)]" />
                  <span className="mt-2 text-xs">Vídeo indisponível</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Information */}
          <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
            {/* Title & Viral Score */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl font-bold leading-tight text-[var(--marfim)]">
                  {clip.title}
                </h3>
                {clip.viralityScore !== null && clip.viralityScore !== undefined && (
                  <div className="flex items-center gap-1.5 text-[24px] font-bold text-[var(--ouro)] whitespace-nowrap shrink-0">
                    <Flame className="h-6 w-6" />
                    {Math.round(clip.viralityScore * 10)}%
                  </div>
                )}
              </div>
              <p className="text-sm font-mono text-[var(--fumaca)] bg-[var(--tinta)] inline-flex px-2 py-1 rounded-md border border-[var(--linha)]">
                Tempo: {interval}
              </p>
            </div>

            {/* Reason */}
            {clip.reason && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--fumaca)] flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4" />
                  Por que é viral?
                </h4>
                <p className="text-sm leading-relaxed text-[var(--marfim)]">
                  {clip.reason}
                </p>
              </div>
            )}

            {/* Transcription */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--fumaca)] flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Transcrição Completa do Corte
              </h4>
              <div className="bg-[var(--tinta)] rounded-lg p-4 border border-[var(--linha)]">
                <p className="text-sm leading-relaxed text-[var(--fumaca)] font-serif italic">
                  {transcriptionText}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
