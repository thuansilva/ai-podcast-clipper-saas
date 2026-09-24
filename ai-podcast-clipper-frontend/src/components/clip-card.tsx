"use client";

import type { Clip } from "@prisma/client";
import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  Download,
  Info,
  Loader2,
  Play,
  Scissors,
  Trash2,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { deleteClip, getClipPlayUrl } from "~/actions/generation";
import { ClipEditorModal } from "./clip-editor-modal";
import { ClipDetailsModal } from "./clip-details-modal";
import { CustomVideoPlayer } from "./custom-video-player";

export interface ClipCardProps {
  clip: Clip;
  onDelete?: (clipId: string) => void;
}

export function ClipCard({ clip, onDelete }: ClipCardProps) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchPlayUrl() {
      setIsLoadingUrl(true);
      try {
        const result = await getClipPlayUrl(clip.id);
        if (isMounted) {
          if ((result.success || result.succes) && result.url) {
            setPlayUrl(result.url);
          } else if (result.error) {
            console.error("Failed to get play url: " + result.error);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching play url", error);
        }
      } finally {
        if (isMounted) {
          setIsLoadingUrl(false);
        }
      }
    }

    void fetchPlayUrl();

    return () => {
      isMounted = false;
    };
  }, [clip.id]);

  const handleDownload = () => {
    if (!playUrl) {
      toast.error("URL do vídeo indisponível para download");
      return;
    }
    const safeTitle = (clip.title || "clip").replace(/[^a-zA-Z0-9_-]/g, "_");
    const link = document.createElement("a");
    link.href = playUrl;
    link.setAttribute("download", `${safeTitle}.mp4`);
    link.setAttribute("target", "_blank");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download iniciado!");
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este clipe? Esta ação não pode ser desfeita.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const result = await deleteClip(clip.id);
      if (result.success) {
        toast.success("Clipe excluído com sucesso!");
        onDelete?.(clip.id);
      } else {
        toast.error(result.error ?? "Erro ao excluir clipe");
      }
    } catch {
      toast.error("Erro inesperado ao excluir clipe");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col group">
        {/* Player vertical 9:16 com bordas arredondadas */}
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-[var(--tinta)] border border-transparent transition-colors hover:border-[var(--linha)]">
          {isLoadingUrl ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--fumaca)]" />
            </div>
          ) : playUrl ? (
            <CustomVideoPlayer src={playUrl} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-[var(--fumaca)]">
              <Play className="h-10 w-10 opacity-40 text-[var(--ouro)]" />
              <span className="mt-2 text-xs">Vídeo indisponível</span>
            </div>
          )}

          {/* Botão de Detalhes (Info) no Canto Superior Direito */}
          <button
            onClick={() => setIsDetailsOpen(true)}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-[var(--marfim)] border border-transparent hover:border-[var(--linha)] transition-all z-10 opacity-80 hover:opacity-100 backdrop-blur-sm"
            title="Ver Detalhes e Transcrição"
          >
            <Info className="h-4 w-4" />
          </button>

          {/* Duração no Player (inferior direito) - Estilo da imagem */}
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 z-10">
            {clip.durationSeconds > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 border-none bg-black/60 font-mono text-[10px] text-[var(--marfim)] backdrop-blur-md px-1.5 py-0.5"
              >
                00:00 {String(Math.round(clip.durationSeconds)).padStart(2, '0')}
              </Badge>
            )}
          </div>
        </div>

        {/* Informações do Clipe e Ações fora do vídeo (abaixo) */}
        <div className="flex flex-col gap-2 mt-3">
          {/* Linha 1: Score e Ações */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[22px] font-bold text-[var(--ouro)]" title="Potencial Viral">
              <Flame className="h-5 w-5" />
              {clip.viralityScore !== null && clip.viralityScore !== undefined 
                ? `${Math.round(clip.viralityScore * 10)}%` 
                : "--"}
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                className="text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors p-1"
                title="Agendar/Calendário"
              >
                <Calendar className="h-[18px] w-[18px]" />
              </button>
              <button
                className="text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors p-1"
                onClick={handleDownload}
                disabled={!playUrl}
                title="Download"
              >
                <Download className="h-[18px] w-[18px]" />
              </button>
              <button
                className="text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors p-1"
                onClick={() => setIsEditorOpen(true)}
                title="Editar Clipe"
              >
                <Scissors className="h-[18px] w-[18px]" />
              </button>
              <button
                className="text-[var(--fumaca)] hover:text-[var(--perigo)] transition-colors p-1"
                onClick={handleDelete}
                disabled={isDeleting}
                title="Excluir Clipe"
              >
                {isDeleting ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Trash2 className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          {/* Linha 2: Título */}
          <h3
            className="line-clamp-2 text-[13px] font-medium leading-tight text-[var(--marfim)]"
            title={clip.title}
          >
            {clip.title}
          </h3>
        </div>
      </div>

      {/* Modal de Edição */}
      <ClipEditorModal
        clip={clip}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
      />

      {/* Modal de Detalhes (Info) */}
      <ClipDetailsModal
        clip={clip}
        playUrl={playUrl}
        isLoadingUrl={isLoadingUrl}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
      />
    </>
  );
}
