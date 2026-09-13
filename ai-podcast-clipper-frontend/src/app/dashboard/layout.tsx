import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import NavHeader from "~/components/nav-header";
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
    <div className="relative flex min-h-screen flex-col bg-[var(--tinta)] text-[var(--marfim)] selection:bg-[var(--ouro)]/20 selection:text-[var(--ouro)]">
      {/* Subtle Ambient Filament Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[450px] w-full max-w-5xl bg-[radial-gradient(ellipse_at_top,rgba(232,186,82,0.04),transparent_70%)] z-0"
      />
      <div className="relative z-10 flex flex-col flex-1">
        <NavHeader credits={user.credits} email={user.email} />
        <main className="container mx-auto flex-1 py-6">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}
