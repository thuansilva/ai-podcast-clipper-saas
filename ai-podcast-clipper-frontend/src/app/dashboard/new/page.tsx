import { redirect } from "next/navigation";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import { db } from "~/server/db";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default async function NewProjectPage(props: {
  searchParams: Promise<{ url?: string }>;
}) {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const initialUrl = searchParams.url || "";

  const [userData, options] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credits: true },
    }),
    getProcessingOptions(),
  ]);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-sm text-[var(--fumaca)]">
        <Link href="/dashboard" className="hover:text-[var(--marfim)] transition-colors">
          Início
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-[var(--ouro)] font-medium">Configurar Projeto</span>
      </nav>

      <CreateProjectClient
        userCredits={userData.credits}
        options={options}
        initialUrl={initialUrl}
        isConfigRoute={true}
      />
    </div>
  );
}
