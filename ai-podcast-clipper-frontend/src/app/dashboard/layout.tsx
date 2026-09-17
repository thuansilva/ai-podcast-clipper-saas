import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "~/components/dashboard/sidebar/app-sidebar";

import { SidebarProvider, SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";
import { Badge } from "~/components/ui/badge";
import { Coins } from "lucide-react";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeSyncUserUseCase } from "~/infrastructure/factories/use-case-factories";
import { db } from "~/server/db";
import { AccountSwitcher } from "~/components/dashboard/header/account-switcher";
import { ThemeToggle } from "~/components/theme-toggle";
import { Separator } from "~/components/ui/separator";
import { TooltipProvider } from "~/components/ui/tooltip";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const authGateway = makeAuthGateway();
  const userId = await authGateway.getUserId();

  if (!userId) {
    redirect("/login");
  }

  let user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, email: true, image: true },
  });

  if (!user) {
    const authUser = await authGateway.getCurrentUser();
    if (authUser?.email) {
      const syncUseCase = makeSyncUserUseCase();
      const syncedUser = await syncUseCase.execute({
        clerkUserId: userId,
        email: authUser.email,
        name: authUser.name,
        image: authUser.imageUrl ?? null,
      });
      user = {
        credits: syncedUser.credits,
        email: syncedUser.email,
        image: authUser.imageUrl ?? null,
      };
    } else {
      redirect("/login");
    }
  }

  // Adapter for the template's users list
  const users = [
    {
      id: userId,
      name: user.email.split("@")[0] ?? "User",
      email: user.email,
      role: "User",
      avatar: user.image ?? "",
      status: "active" as const,
    }
  ];

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="relative flex-1 min-w-0 flex flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b">
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mx-2 h-4" />
                {/* Optional Search */}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="default"
                  className="flex h-8 items-center gap-1.5 bg-[var(--ouro)] px-3 py-1 font-mono text-xs font-semibold text-[var(--tinta)] hover:bg-[var(--ouro)]/90 mr-2 border-none"
                >
                  <Coins className="h-4 w-4" />
                  {user.credits} créditos
                </Badge>
                <ThemeToggle />
                <AccountSwitcher />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
          
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
