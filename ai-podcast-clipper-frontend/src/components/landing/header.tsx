import Link from "next/link";
import { SparklesIcon, ArrowRightIcon } from "lucide-react";

export function Header({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
            <SparklesIcon className="h-4 w-4 text-zinc-200" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-zinc-100">Podcast Clipper</span>
            <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              STUDIO
            </span>
          </div>
        </Link>

        {/* Links de Navegação */}
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
          <Link href="#demonstracao" className="transition-colors hover:text-zinc-100">
            Demonstração
          </Link>
          <Link href="#comparativo" className="transition-colors hover:text-zinc-100">
            Comparativo
          </Link>
          <Link href="#precos" className="transition-colors hover:text-zinc-100">
            Preços
          </Link>
          <Link href="#faq" className="transition-colors hover:text-zinc-100">
            FAQ
          </Link>
        </nav>

        {/* Ações */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Acessar Painel
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3.5 py-2 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                Começar Agora
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
