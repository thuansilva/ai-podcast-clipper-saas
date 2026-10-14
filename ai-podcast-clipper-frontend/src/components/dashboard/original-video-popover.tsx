"use client";

import { ChevronDown, Clock, ExternalLink, Film } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

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
 * Chip clicável (ao lado das métricas do cabeçalho do projeto) que revela,
 * sob demanda, os dados do vídeo original do projeto. O conteúdo fica escondido até o clique e a URL crua nunca é
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
      <PopoverTrigger asChild>
        {/* Sem aria-label: o nome acessível é o próprio texto visível
            ("Vídeo original"), atendendo WCAG 2.5.3 (label in name). */}
        <button
          type="button"
          data-testid="original-video-trigger"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--linha)] bg-[var(--superficie)] px-3 py-1 text-sm text-[var(--prata)] transition-colors hover:border-[var(--ouro)]/60 hover:text-[var(--marfim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)] data-[state=open]:border-[var(--ouro)]/60 data-[state=open]:text-[var(--marfim)]"
        >
          <Film className="h-4 w-4 text-[var(--ouro)]" aria-hidden="true" />
          <span className="font-medium text-[var(--ouro)]">Vídeo original</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-[var(--fumaca)] transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
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
