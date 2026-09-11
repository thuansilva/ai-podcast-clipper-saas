"use client";

import type { Clip } from "@prisma/client";
import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  Loader2,
  Pencil,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { deleteClip, getClipPlayUrl } from "~/actions/generation";
import { ClipEditorModal } from "./clip-editor-modal";

export interface ClipCardProps {
  clip: Clip;
  onDelete?: (clipId: string) => void;
}

export function ClipCard({ clip, onDelete }: ClipCardProps) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);
  const [copiedHook, setCopiedHook] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
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

  const handleCopyHook = async () => {
    if (!clip.hook) return;
    try {
      await navigator.clipboard.writeText(clip.hook);
      setCopiedHook(true);
      toast.success("Hook copiado para a área de transferência!");
      setTimeout(() => setCopiedHook(false), 2000);
    } catch {
      toast.error("Falha ao copiar hook");
    }
  };

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
      <Card className="flex flex-col overflow-hidden border-border/80 transition-all hover:shadow-md">
        {/* Player vertical 9:16 */}
        <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
          {isLoadingUrl ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : playUrl ? (
            <video
              src={playUrl}
              controls
              preload="metadata"
              className="h-full w-full object-cover"
              aria-label={`Vídeo do clipe ${clip.title}`}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
              <Play className="h-10 w-10 opacity-40" />
              <span className="mt-2 text-xs">Vídeo indisponível</span>
            </div>
          )}

          {/* Badges de sobreposição no topo do player */}
          <div className="pointer-events-none absolute left-2 right-2 top-2 flex items-center justify-between gap-1">
            {clip.viralityScore !== null && clip.viralityScore !== undefined ? (
              <Badge
                variant="default"
                className="bg-red-500/90 font-semibold text-white shadow-xs backdrop-blur-xs hover:bg-red-500"
                data-testid="virality-badge"
              >
                🔥 {clip.viralityScore}/10
              </Badge>
            ) : (
              <Badge variant="secondary" className="backdrop-blur-xs">
                Score N/A
              </Badge>
            )}

            {clip.durationSeconds > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-black/60 font-mono text-[10px] text-white backdrop-blur-xs"
              >
                <Clock className="h-3 w-3" />
                {Math.round(clip.durationSeconds)}s
              </Badge>
            )}
          </div>
        </div>

        {/* Informações do Clipe */}
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="line-clamp-2 text-sm font-semibold leading-snug"
              title={clip.title}
            >
              {clip.title}
            </h3>
            {clip.subtitlePreset && (
              <Badge
                variant="outline"
                className="shrink-0 px-1.5 py-0 text-[10px] uppercase font-mono"
              >
                {clip.subtitlePreset}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col justify-between space-y-3 p-4 pt-0">
          {clip.hook && (
            <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/60 p-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1 text-foreground">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Hook Sugerido
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyHook}
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Copiar Hook"
                >
                  {copiedHook ? (
                    <span className="flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" /> Copiado!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy className="h-3 w-3" /> Copiar Hook
                    </span>
                  )}
                </Button>
              </div>
              <p className="italic text-foreground/90 line-clamp-2">
                &ldquo;{clip.hook}&rdquo;
              </p>
            </div>
          )}

          {clip.reason && (
            <p
              className="text-[11px] text-muted-foreground line-clamp-2"
              title={clip.reason}
            >
              <span className="font-medium text-foreground/80">
                Por que viraliza:
              </span>{" "}
              {clip.reason}
            </p>
          )}
        </CardContent>

        {/* Ações: Download, Edição e Exclusão */}
        <CardFooter className="flex items-center gap-2 border-t border-border/40 p-4 pt-3">
          <Button
            variant="default"
            size="sm"
            onClick={handleDownload}
            disabled={!playUrl}
            className="flex-1 text-xs"
            aria-label="Download"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditorOpen(true)}
            className="px-2.5 text-xs"
            title="Editar Clipe"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Editar</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-2.5 text-xs"
            title="Excluir Clipe"
            aria-label="Excluir"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Modal de Edição */}
      <ClipEditorModal
        clip={clip}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
      />
    </>
  );
}
