"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "~/components/theme-toggle";
import { SidebarTrigger } from "~/components/ui/sidebar";

export function TopBar({ credits, email }: { credits: number; email: string }) {
  const pathname = usePathname();
  
  // Simple breadcrumb logic
  const breadcrumbs = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-[var(--linha)] bg-[var(--tinta)]/80 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1 text-[var(--fumaca)] hover:text-[var(--marfim)]" />
        <div className="h-4 w-px bg-[var(--linha)] hidden sm:block"></div>
        <div className="flex items-center gap-2 text-sm text-[var(--fumaca)] font-medium">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2">
              {idx > 0 && <span className="text-[var(--linha-2)]">/</span>}
              <span className={idx === breadcrumbs.length - 1 ? "text-[var(--marfim)]" : ""}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-xs text-[var(--fumaca)]">{email}</span>
          <span className="text-xs font-mono text-[var(--ouro)] font-semibold">{credits} credits left</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
