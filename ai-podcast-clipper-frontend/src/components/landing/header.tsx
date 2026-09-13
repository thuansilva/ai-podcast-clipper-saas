import Link from "next/link";
import { SparklesIcon, ArrowRightIcon } from "lucide-react";

export function Header({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--linha)] bg-[#0b0a08]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[#161310] shadow-[0_0_12px_rgba(232,186,82,0.15)]">
            <SparklesIcon className="h-4 w-4 text-[var(--ouro)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-[var(--marfim)]">Podcast Clipper</span>
            <span className="rounded-full border border-[var(--linha-2)] bg-[#161310] px-2 py-0.5 font-mono text-[10px] text-[var(--ouro)] tracking-widest">
              STUDIO
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden items-center gap-6 text-sm text-[var(--fumaca)] md:flex">
          <Link href="#demo" className="transition-colors hover:text-[var(--marfim)]">
            Live Demo
          </Link>
          <Link href="#platforms" className="transition-colors hover:text-[var(--marfim)]">
            Platforms
          </Link>
          <Link href="#comparison" className="transition-colors hover:text-[var(--marfim)]">
            Comparison
          </Link>
          <Link href="#pricing" className="transition-colors hover:text-[var(--marfim)]">
            Pricing
          </Link>
          <Link href="#faq" className="transition-colors hover:text-[var(--marfim)]">
            FAQ
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="btn-ouro !text-xs !py-1.5 !px-4"
            >
              Go to Dashboard
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs font-medium text-[var(--marfim-2)] transition-colors hover:text-[var(--ouro)]"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="btn-ouro !text-xs !py-1.5 !px-4"
              >
                Start Free
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
