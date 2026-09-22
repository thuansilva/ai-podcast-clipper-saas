import { redirect } from "next/navigation";
import Link from "next/link";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { ArrowLeft, Clock, Film } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";

export default async function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  const project = await db.uploadedFile.findUnique({
    where: { id, userId },
    include: {
      clips: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!project) redirect("/dashboard/projects");

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-6">
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
            <Film className="mr-1 h-4 w-4" /> {project.clips.length} cortes gerados
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-[var(--marfim)] mb-4">Cortes Gerados</h2>
        {project.clips.length === 0 ? (
          <div className="py-20 text-center text-[var(--fumaca)] border border-dashed border-[var(--linha)] rounded-xl">
            {project.status === "processing" || project.status === "queued"
              ? "O projeto está sendo processado. Os cortes aparecerão aqui em breve."
              : project.status === "failed"
                ? ("Falha ao processar o projeto. " + (project.errorMessage || "")).trim()
                : "Nenhum corte gerado."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {project.clips.map((clip) => {
              // Verifica se é uma chave de storage local ou URL completa
              const videoUrl = clip.s3Key && (clip.s3Key.startsWith("http") || clip.s3Key.startsWith("blob:"))
                ? clip.s3Key
                : `/api/local-storage?key=${encodeURIComponent(clip.s3Key || "")}`;

              return (
                <Card
                  key={clip.id}
                  className="bg-[var(--superficie-2)] border-[var(--linha)] overflow-hidden flex flex-col"
                >
                  <div className="aspect-[9/16] bg-black relative group flex-shrink-0">
                    <video
                      src={videoUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <CardContent className="p-3">
                    <p className="font-semibold text-sm text-[var(--marfim)] line-clamp-2">
                      {clip.title}
                    </p>
                    <p className="text-xs text-[var(--ouro)] mt-1 font-medium">
                      🚀 Score: {clip.viralityScore != null ? Math.round(clip.viralityScore) : "N/A"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
