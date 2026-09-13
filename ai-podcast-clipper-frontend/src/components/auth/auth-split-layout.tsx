import Link from "next/link";
import { ArrowLeftIcon, SparklesIcon, ShieldCheckIcon } from "lucide-react";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthSplitLayout({
  children,
  title = "Painel de Produção",
  subtitle = "Crie cortes verticais em escala a partir de episódios de podcasts.",
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-100">
      {/* Coluna Esquerda: Showcase Editorial Studio (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-zinc-800/70 bg-zinc-950 p-10 lg:flex">
        {/* Header do Lado Esquerdo */}
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
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
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Voltar ao site
          </Link>
        </div>

        {/* Centro: Mockup Visual Minimalista e Destaque */}
        <div className="my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            REC • ENGINE DE CORTE AUTOMÁTICO
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">{title}</h1>
            <p className="text-sm leading-relaxed text-zinc-400">{subtitle}</p>
          </div>

          {/* Card Mockup de Corte 9:16 */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-300">Episódio #42 - Viral Hook</span>
                <span className="rounded bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  Score Viral: 94/100
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">00:14:22 → 00:15:08</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>Detecção facial ativa (9:16)</span>
              <span className="font-mono text-zinc-500">60 FPS • 1080p</span>
            </div>
          </div>
        </div>

        {/* Rodapé do Lado Esquerdo */}
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <ShieldCheckIcon className="h-4 w-4 text-zinc-400" />
          <span>Processamento em nuvem isolada e pagamentos protegidos por Stripe.</span>
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação */}
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-8 lg:w-1/2 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          {/* Header Mobile */}
          <div className="mb-6 flex w-full items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">Podcast Clipper</span>
              <span className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono text-[9px] text-zinc-400">
                STUDIO
              </span>
            </Link>
            <Link href="/" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
              <ArrowLeftIcon className="h-3 w-3" />
              Início
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
