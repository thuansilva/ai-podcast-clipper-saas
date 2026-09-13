import { SparklesIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 py-12 text-zinc-500">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900">
              <SparklesIcon className="h-3 w-3 text-zinc-300" />
            </div>
            <span className="text-sm font-semibold text-zinc-300">Podcast Clipper Studio</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <span className="flex items-center gap-1.5 font-mono text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Todos os sistemas operacionais
            </span>
          </div>

          <p className="font-mono text-xs text-zinc-500">
            © {new Date().getFullYear()} Podcast Clipper. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
