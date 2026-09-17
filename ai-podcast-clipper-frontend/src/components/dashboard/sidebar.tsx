"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, PlusCircleIcon, VideoIcon, ClapperboardIcon, CreditCardIcon, SparklesIcon } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Overview", icon: <LayoutDashboardIcon className="h-4 w-4" /> },
    { href: "/dashboard/create", label: "New Project", icon: <PlusCircleIcon className="h-4 w-4" /> },
    { href: "/dashboard/projects", label: "Meus Projetos", icon: <VideoIcon className="h-4 w-4" /> },
    { href: "/dashboard/clips", label: "My Clips", icon: <ClapperboardIcon className="h-4 w-4" /> },
    { href: "/dashboard/billing", label: "Billing", icon: <CreditCardIcon className="h-4 w-4" /> },
  ];

  return (
    <aside className="w-64 border-r border-[var(--linha)] bg-[var(--tinta)] flex flex-col h-screen sticky top-0 shrink-0 z-40">
      <div className="h-16 flex items-center px-6 border-b border-[var(--linha)]">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--superficie)] shadow-[0_0_12px_rgba(232,186,82,0.15)]">
            <SparklesIcon className="h-3.5 w-3.5 text-[var(--ouro)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-[var(--marfim)]">Podcast Clipper</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto hide-scrollbar">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive
                  ? "bg-[var(--ouro)]/10 text-[var(--ouro)] border border-[var(--ouro)]/20"
                  : "text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--superficie)] border border-transparent"
              }`}
            >
              {link.icon}
              <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
