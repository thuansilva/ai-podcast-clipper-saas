import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "~/components/dashboard/sidebar";
import { TopBar } from "~/components/dashboard/top-bar";
import { Toaster } from "~/components/ui/sonner";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeSyncUserUseCase } from "~/infrastructure/factories/use-case-factories";
import { db } from "~/server/db";

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
    select: { credits: true, email: true },
  });

  if (!user) {
    const authUser = await authGateway.getCurrentUser();
    if (authUser?.email) {
      const syncUseCase = makeSyncUserUseCase();
      const syncedUser = await syncUseCase.execute({
        clerkUserId: userId,
        email: authUser.email,
        name: authUser.name,
        image: authUser.imageUrl,
      });
      user = {
        credits: syncedUser.credits,
        email: syncedUser.email,
      };
    } else {
      redirect("/login");
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--tinta)] text-[var(--marfim)] selection:bg-[var(--ouro)]/20 selection:text-[var(--ouro)]">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Subtle Ambient Filament Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[450px] w-full max-w-5xl bg-[radial-gradient(ellipse_at_top,rgba(232,186,82,0.04),transparent_70%)] z-0"
        />
        
        <TopBar credits={user.credits} email={user.email} />
        
        <main className="flex-1 overflow-y-auto z-10 relative">
          <div className="container mx-auto p-6 max-w-6xl">
            {children}
          </div>
        </main>
        <Toaster />
      </div>
    </div>
  );
}
