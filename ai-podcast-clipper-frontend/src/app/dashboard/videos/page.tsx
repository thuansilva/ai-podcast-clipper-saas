import { Suspense } from "react";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { RecentVideosClient } from "~/components/dashboard/recent-videos-client";
import { VideosToolbar } from "~/components/dashboard/videos-toolbar";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";

interface VideosPageProps {
  searchParams?: Promise<{
    page?: string;
    search?: string;
    sort?: string;
  }>;
}

function createPageUrl(pageNumber: number, search?: string, sort?: string) {
  const params = new URLSearchParams();
  params.set("page", pageNumber.toString());
  if (search) {
    params.set("search", search);
  }
  if (sort) {
    params.set("sort", sort);
  }
  return `/dashboard/videos?${params.toString()}`;
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis-left" | "ellipsis-right")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis-left" | "ellipsis-right")[] = [1];

  if (currentPage > 3) {
    items.push("ellipsis-left");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    items.push(i);
  }

  if (currentPage < totalPages - 2) {
    items.push("ellipsis-right");
  }

  items.push(totalPages);
  return items;
}

export default async function VideosPage(props: VideosPageProps) {
  const userId = await makeAuthGateway().getUserId();

  if (!userId) {
    redirect("/login");
  }

  const resolvedSearchParams = (await props?.searchParams) ?? {};
  const rawPage = resolvedSearchParams.page;
  const parsedPage = rawPage ? parseInt(rawPage, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const search = resolvedSearchParams.search ?? "";
  const sort = resolvedSearchParams.sort === "asc" ? "asc" : "desc";

  const listUserVideosUseCase = makeListUserVideosUseCase();
  const result = await listUserVideosUseCase.execute({
    userId,
    page,
    search,
    sort,
  });

  const paginationItems = getPaginationItems(page, result.totalPages);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">Meus Vídeos</h1>
        <p className="text-sm text-[var(--fumaca)]">
          Acompanhe todos os seus projetos e vídeos enviados.
        </p>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <VideosToolbar />
      </Suspense>

      <RecentVideosClient
        uploadedFiles={result.data}
        hideHeader
        emptyMessage={
          search
            ? `Nenhum vídeo encontrado para "${search}".`
            : "Nenhum vídeo cadastrado."
        }
      />

      {result.totalPages > 1 && (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={page > 1 ? createPageUrl(page - 1, search, sort) : "#"}
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                text="Anterior"
              />
            </PaginationItem>

            {paginationItems.map((item, idx) => {
              if (typeof item === "string") {
                return (
                  <PaginationItem key={`${item}-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }

              return (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={createPageUrl(item, search, sort)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            <PaginationItem>
              <PaginationNext
                href={
                  page < result.totalPages
                    ? createPageUrl(page + 1, search, sort)
                    : "#"
                }
                aria-disabled={page >= result.totalPages}
                className={
                  page >= result.totalPages
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
                text="Próximo"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
