import { Suspense } from "react";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { VideosToolbar } from "~/components/dashboard/videos-toolbar";
import { InfiniteProjectsList } from "~/components/dashboard/infinite-projects-list";

interface ProjectsPageProps {
  searchParams?: Promise<{
    page?: string;
    search?: string;
    sort?: string;
  }>;
}

export default async function ProjectsPage(props: ProjectsPageProps) {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const resolvedSearchParams = (await props?.searchParams) ?? {};
  const search = resolvedSearchParams.search ?? "";
  const sort = resolvedSearchParams.sort === "asc" ? "asc" : "desc";

  const listUserVideosUseCase = makeListUserVideosUseCase();
  const result = await listUserVideosUseCase.execute({
    userId,
    page: 1,
    limit: 20,
    search,
    sort,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">
          Meus Projetos
        </h1>
        <p className="text-sm text-[var(--fumaca)]">
          Acompanhe todos os seus projetos e vídeos enviados.
        </p>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <VideosToolbar />
      </Suspense>

      <InfiniteProjectsList
        initialData={result.data}
        initialTotalPages={result.totalPages}
        search={search}
        sort={sort}
      />
    </div>
  );
}
