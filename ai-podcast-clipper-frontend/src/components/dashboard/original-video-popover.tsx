"use client";

import { Clock, ExternalLink, Film } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface OriginalVideoPopoverProps {
  displayName: string | null;
  durationMinutes: number;
  thumbnailUrl: string | null;
  /**
   * URL canônica já validada pelo VO `YouTubeUrl` (nunca o valor bruto do
   * banco). `null` quando o projeto não tem URL válida do YouTube.
   */
  youtubeCanonicalUrl: string | null;
}

/**
 * Botão de ícone que revela, sob demanda, os dados do vídeo original do
 * projeto. O conteúdo fica escondido até o clique e a URL crua nunca é
 * exibida: o acesso ao YouTube é um link de texto.
 */
export function OriginalVideoPopover({
  displayName,
  durationMinutes,
  thumbnailUrl,
  youtubeCanonicalUrl,
}: OriginalVideoPopoverProps) {
  const title = displayName || "Sem título";

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Ver vídeo original"
                data-testid="original-video-trigger"
                className="border-[var(--linha)] bg-[var(--superficie)] text-[var(--prata)] hover:bg-[var(--superficie-2)] hover:text-[var(--marfim)]"
              >
                <Film aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Vídeo original</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        data-testid="original-video-card"
        className="w-80 gap-3 border border-[var(--linha)] bg-[var(--superficie)] p-3 text-[var(--marfim)]"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fumaca)]">
          Vídeo original
        </p>
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-[var(--linha)] bg-[var(--superficie-2)]">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- não há remotePatterns configurados para next/image (S3/YouTube); ver convenção em recent-videos-client.tsx
            <img
              src={thumbnailUrl}
              alt={`Thumbnail do vídeo original: ${title}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--fumaca)]">
              <Film className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
        </div>
        <p
          className="line-clamp-2 text-sm font-medium text-[var(--marfim)]"
          title={displayName || undefined}
        >
          {title}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--fumaca)]">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {durationMinutes} min de duração
          </span>
          {youtubeCanonicalUrl && (
            <a
              data-testid="original-video-youtube-link"
              href={youtubeCanonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded text-[var(--prata)] underline underline-offset-2 hover:text-[var(--ouro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]"
            >
              Assistir no YouTube
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
