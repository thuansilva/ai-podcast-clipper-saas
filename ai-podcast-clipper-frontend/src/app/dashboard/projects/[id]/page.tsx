import { redirect } from "next/navigation";
import Link from "next/link";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { ArrowLeft, Clock, Film } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { ClipCard } from "~/components/clip-card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";

const CLIPS_PER_PAGE = 10;

export default async function ProjectDetailsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  
  const pageParam = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  const project = await db.uploadedFile.findUnique({
    where: { id, userId },
    include: {
      clips: {
        orderBy: {
          createdAt: "desc",
        },
        take: CLIPS_PER_PAGE,
        skip: (page - 1) * CLIPS_PER_PAGE,
      },
      _count: {
        select: { clips: true }
      }
    },
  });

  if (!project) redirect("/dashboard/projects");

  const totalClips = project._count.clips;
  const totalPages = Math.ceil(totalClips / CLIPS_PER_PAGE);

  return (
    <div className="w-full h-full space-y-8 p-4 md:p-6">
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center text-sm text-[var(--fumaca)] hover:text-[var(--marfim)]"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Projetos
      </Link>

      <div className="bg-[var(--superficie)] border border-[var(--linha)] rounded-xl p-6">
        <h1 className="text-2xl font-bold text-[var(--marfim)]">
          {project.displayName || project.id}
        </h1>
        <div className="flex gap-4 mt-2 text-sm text-[var(--fumaca)]">
          <span className="flex items-center">
            <Clock className="mr-1 h-4 w-4" /> {Math.floor(project.durationSeconds / 60)} min
          </span>
          <span className="flex items-center">
            <Film className="mr-1 h-4 w-4" /> {totalClips} cortes gerados
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-[var(--marfim)] mb-4">Cortes Gerados</h2>
        {totalClips === 0 ? (
          <div className="py-20 text-center text-[var(--fumaca)] border border-dashed border-[var(--linha)] rounded-xl">
            {project.status === "processing" || project.status === "queued"
              ? "O projeto está sendo processado. Os cortes aparecerão aqui em breve."
              : project.status === "failed"
                ? ("Falha ao processar o projeto. " + (project.errorMessage || "")).trim()
                : "Nenhum corte gerado."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {project.clips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={page > 1 ? `/dashboard/projects/${id}?page=${page - 1}` : "#"}
                        className={page === 1 ? "pointer-events-none opacity-50" : ""}
                        aria-disabled={page === 1}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          href={`/dashboard/projects/${id}?page=${i + 1}`}
                          isActive={page === i + 1}
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href={page < totalPages ? `/dashboard/projects/${id}?page=${page + 1}` : "#"}
                        className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                        aria-disabled={page === totalPages}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
