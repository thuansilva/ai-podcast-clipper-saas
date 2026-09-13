import Link from "next/link";
import { ArrowLeftIcon, SparklesIcon, ShieldCheckIcon } from "lucide-react";
import { ThemeToggle } from "~/components/theme-toggle";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthSplitLayout({
  children,
  title = "Production Studio",
  subtitle = "Turn long-form podcast episodes into high-retention viral clips at scale.",
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-[var(--tinta)] text-[var(--marfim)]">
      {/* Left Column: Studio Editorial Showcase (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-[var(--linha)] bg-[var(--superficie)] p-10 lg:flex overflow-hidden">
        {/* Subtle noble atmospheric glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(232,186,82,0.04),transparent_100%)]"
        />

        {/* Left Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--superficie-2)] shadow-[0_0_12px_rgba(232,186,82,0.15)]">
              <SparklesIcon className="h-4 w-4 text-[var(--ouro)]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-[var(--marfim)]">Podcast Clipper</span>
              <span className="rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--ouro)] tracking-widest">
                STUDIO
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-[var(--fumaca)] transition-colors hover:text-[var(--marfim)]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Back to website
            </Link>
          </div>
        </div>

        {/* Center: Showcase Card */}
        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)] px-3.5 py-1.5 font-mono text-xs text-[var(--marfim-2)]">
            <span className="h-2 w-2 rounded-full bg-[var(--ouro)] animate-pulse" />
            REC • AUTOMATED VIDEO CLIPPING ENGINE
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--marfim)]">{title}</h1>
            <p className="text-sm leading-relaxed text-[var(--fumaca)]">{subtitle}</p>
          </div>

          {/* 9:16 Mockup Card */}
          <div className="rounded-2xl border border-[var(--linha)] bg-[var(--superficie-2)] p-5 backdrop-blur-sm shadow-[0_0_35px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between border-b border-[var(--linha)] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--marfim)]">Episode #42 - Viral Hook</span>
                <span className="rounded-full bg-[var(--patina)]/15 border border-[var(--patina)]/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--patina)]">
                  Viral Score: 94/100
                </span>
              </div>
              <span className="font-mono text-[11px] text-[var(--fumaca)]">00:14:22 → 00:15:08</span>
            </div>
            <div className="mt-3.5 flex items-center justify-between text-xs text-[var(--fumaca)]">
              <span>Active speaker face tracking (9:16)</span>
              <span className="font-mono text-[var(--prata)]">60 FPS • 1080p</span>
            </div>
          </div>
        </div>

        {/* Left Footer */}
        <div className="relative z-10 flex items-center gap-2 font-mono text-xs text-[var(--fumaca)]">
          <ShieldCheckIcon className="h-4 w-4 text-[var(--patina)]" />
          <span>Isolated cloud execution & Stripe secure payments.</span>
        </div>
      </div>

      {/* Right Column: Authentication Form */}
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-8 lg:w-1/2 lg:px-16 bg-[var(--tinta)]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          {/* Mobile Header */}
          <div className="mb-6 flex w-full items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--marfim)]">Podcast Clipper</span>
              <span className="rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ouro)]">
                STUDIO
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/" className="flex items-center gap-1 text-xs text-[var(--fumaca)] hover:text-[var(--marfim)]">
                <ArrowLeftIcon className="h-3 w-3" />
                Home
              </Link>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
