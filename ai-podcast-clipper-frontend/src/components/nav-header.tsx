"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import { UserNavMenu } from "./user-nav-menu";

const NavHeader = ({ credits }: { credits: number; email: string }) => {
  return (
    <header className="sticky top-0 z-50 flex justify-center border-b border-[var(--linha)] bg-[var(--tinta)]/85 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between px-4 py-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--superficie)] shadow-[0_0_12px_rgba(232,186,82,0.15)]">
            <Sparkles className="h-4 w-4 text-[var(--ouro)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-[var(--marfim)]">
              Podcast Clipper
            </span>
            <span className="rounded-full border border-[var(--linha-2)] bg-[var(--superficie)] px-2 py-0.5 font-mono text-[10px] tracking-widest text-[var(--ouro)]">
              STUDIO
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <div className="flex items-center gap-2.5">
            <Badge
              variant="outline"
              className="flex h-8 items-center gap-1.5 border-[var(--linha-2)] bg-[var(--superficie)] px-3 py-1 font-mono text-xs font-medium text-[var(--patina)]"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--patina)]" />
              {credits} créditos
            </Badge>
            <Button
              size="sm"
              asChild
              className="btn-ouro !h-8 !px-3.5 !py-1 !text-xs"
            >
              <Link href="/dashboard/billing">Comprar mais</Link>
            </Button>
          </div>

          <UserNavMenu />
        </div>
      </div>
    </header>
  );
};

export default NavHeader;
