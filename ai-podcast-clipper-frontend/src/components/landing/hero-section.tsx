import Link from "next/link";
import { ChevronDownIcon, PlayIcon } from "lucide-react";

export function HeroSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryHref = isAuthenticated ? "/dashboard" : "/signup";
  const primaryText = isAuthenticated ? "Ir para o Painel de Vídeos →" : "Criar Meus Primeiros Cortes →";

  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        {/* Badge de Estúdio */}
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          REC • REENQUADRAMENTO FACIAL EM 9:16 & LEGENDAS AUTOMÁTICAS
        </div>

        {/* Título Principal */}
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl md:text-6xl md:leading-[1.15]">
          De podcasts longos a cortes virais. <br className="hidden sm:inline" />
          <span className="text-zinc-400">Em 3 minutos, sem abrir o Premiere.</span>
        </h1>

        {/* Subtítulo focado em valor real */}
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Cole a URL do seu episódio do YouTube. Nossa engine detecta os momentos de maior retenção, reenquadra
          automaticamente os participantes para formato vertical e gera legendas dinâmicas sincronizadas prontas para TikTok,
          Reels e Shorts.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href={primaryHref}
            className="w-full rounded-lg bg-zinc-100 px-6 py-3.5 text-sm font-medium text-zinc-950 shadow-sm transition-colors hover:bg-zinc-200 sm:w-auto"
          >
            {primaryText}
          </Link>
          <a
            href="#demonstracao"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:w-auto"
          >
            <PlayIcon className="h-4 w-4 text-zinc-400" />
            Ver Exemplo de Corte
            <ChevronDownIcon className="h-4 w-4 text-zinc-500" />
          </a>
        </div>

        {/* Prova de Garantia */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 font-mono text-xs text-zinc-500">
          <span>✓ 10 créditos grátis ao cadastrar</span>
          <span>•</span>
          <span>✓ Sem cartão de crédito obrigatório</span>
          <span>•</span>
          <span>✓ Exportação em 1080p a 60 FPS</span>
        </div>
      </div>
    </section>
  );
}
