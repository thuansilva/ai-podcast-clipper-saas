import Link from "next/link";
import { ChevronDownIcon, PlayIcon } from "lucide-react";

export function HeroSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryHref = isAuthenticated ? "/dashboard" : "/signup";
  const primaryText = isAuthenticated ? "Go to Video Studio →" : "Claim 10 Free Credits →";

  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        {/* Studio Status Indicator */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--linha-2)] bg-[#161310]/90 px-4 py-1.5 font-mono text-xs text-[var(--marfim-2)] shadow-[0_0_15px_rgba(232,186,82,0.08)]">
          <span className="h-2 w-2 rounded-full bg-[var(--ouro)] animate-pulse" />
          REC • AI 9:16 SMART REFRAME & DYNAMIC CAPTIONS
        </div>

        {/* Main Headline */}
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[var(--marfim)] sm:text-5xl md:text-6xl md:leading-[1.15]">
          Turn 1-hour podcasts into <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-[var(--ouro)] via-[var(--marfim)] to-[var(--cobre)] bg-clip-text text-transparent">
            10 viral clips in 3 minutes.
          </span>
        </h1>

        {/* Irresistible Value Proposition Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--marfim-2)] sm:text-lg">
          Paste your YouTube URL. Our engine detects high-retention hooks, auto-reframes the active speaker
          into 9:16 vertical video, and generates animated word-by-word subtitles ready for TikTok, Reels, and Shorts.
          Without touching Premiere or CapCut.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href={primaryHref}
            className="btn-ouro w-full sm:w-auto !py-3.5 !px-8 text-sm"
          >
            {primaryText}
          </Link>
          <a
            href="#demo"
            className="btn-linha w-full sm:w-auto !py-3.5 !px-6 text-sm"
          >
            <PlayIcon className="h-4 w-4 text-[var(--ouro)]" />
            Watch Live Transformation
            <ChevronDownIcon className="h-4 w-4 text-[var(--fumaca)]" />
          </a>
        </div>

        {/* Trust & Guarantee Banner */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5 font-mono text-xs text-[var(--fumaca)]">
          <span className="text-[var(--ouro)]">✓ 10 free minutes on signup</span>
          <span className="text-[var(--linha-2)]">•</span>
          <span className="text-[var(--marfim-2)]">✓ No credit card required</span>
          <span className="text-[var(--linha-2)]">•</span>
          <span className="text-[var(--prata)]">✓ 1080p 60 FPS export</span>
          <span className="text-[var(--linha-2)]">•</span>
          <span className="text-[var(--patina)] font-medium">✓ Credits never expire</span>
        </div>
      </div>
    </section>
  );
}
