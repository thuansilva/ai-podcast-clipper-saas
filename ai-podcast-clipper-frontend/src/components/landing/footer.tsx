import { SparklesIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[var(--linha)] bg-[var(--tinta)] py-12 text-[var(--fumaca)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--superficie)] shadow-[0_0_10px_rgba(232,186,82,0.15)]">
              <SparklesIcon className="h-3 w-3 text-[var(--ouro)]" />
            </div>
            <span className="text-sm font-semibold text-[var(--marfim)]">Podcast Clipper Studio</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono text-[var(--fumaca)]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--patina)]" />
              All Systems Operational (AWS + Cloudflare)
            </span>
            <span className="text-[var(--linha-2)]">•</span>
            <span className="text-[var(--prata)]">1080p 60FPS Video Pipeline</span>
          </div>

          <p className="font-mono text-xs text-[var(--fumaca)]">
            © {new Date().getFullYear()} Podcast Clipper Studio. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
