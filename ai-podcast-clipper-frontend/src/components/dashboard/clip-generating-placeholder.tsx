import { Loader2 } from "lucide-react";
import type { GeneratingPlaceholder } from "~/lib/generating-batch-placeholders";

/**
 * Card "gerando…" no mesmo formato vertical (9/16) do `ClipCard`. O shimmer
 * só anima com `motion-safe` (respeita `prefers-reduced-motion`).
 */
export function ClipGeneratingPlaceholder({
  placeholder,
}: {
  placeholder: GeneratingPlaceholder;
}) {
  const statusLabel = placeholder.status === "queued" ? "Na fila" : "Gerando…";

  return (
    <div
      data-testid="clip-generating-placeholder"
      aria-busy="true"
      className="flex flex-col"
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-[var(--ouro)]/30 bg-[var(--superficie)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[var(--superficie)] via-[var(--superficie-2)] to-[var(--superficie)] motion-safe:animate-pulse"
        />
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 px-3 text-center">
          <Loader2
            className="h-8 w-8 text-[var(--ouro)] motion-safe:animate-spin"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-[var(--marfim)]">
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {placeholder.title && (
          <p className="line-clamp-2 text-sm font-semibold text-[var(--marfim)]">
            {placeholder.title}
          </p>
        )}
        {placeholder.rangeLabel && (
          <p className="font-mono text-xs text-[var(--prata)]">
            {placeholder.rangeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
