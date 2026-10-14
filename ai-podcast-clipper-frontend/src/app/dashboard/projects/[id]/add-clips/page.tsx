import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { AddClipsToProjectClient } from "~/components/dashboard/add-clips-to-project-client";
import { UnsupportedAppendSourceError } from "~/domain/errors/unsupported-append-source-error";
import { LegacyClipsMissingSourceRangeError } from "~/domain/errors/legacy-clips-missing-source-range-error";
import { ProjectBatchInProgressError } from "~/domain/errors/project-batch-in-progress-error";
import type { TimeRange } from "~/lib/used-ranges";

/**
 * Rota dedicada de "Adicionar mais cortes" a um projeto já existente (RF
 * novo — ver `AddClipsToProjectUseCase`). Escolhida como rota própria (em
 * vez de um Dialog/Sheet sobre a tela de detalhes do projeto) pelo mesmo
 * motivo de `/dashboard/projects/[id]/edit`: o formulário tem conteúdo
 * substancial (seletor de modo, editor de cortes manuais com múltiplos
 * sliders, prévia de custo), que cabe mal em um modal sem comprometer
 * usabilidade/acessibilidade (foco, scroll, mobile).
 *
 * Condições que bloqueiam a função inteira são resolvidas aqui (servidor),
 * antes de montar o formulário client-side — mensagens reaproveitadas
 * diretamente das classes de erro de domínio para nunca divergir do texto
 * que a Server Action devolveria no mesmo cenário:
 * - `UnsupportedAppendSourceError`: projeto não é do YouTube.
 * - `LegacyClipsMissingSourceRangeError`: projeto tem clipe antigo sem
 *   `sourceStartTime`/`sourceEndTime` (não dá para calcular com certeza os
 *   intervalos já usados).
 * - `ProjectBatchInProgressError`: já existe um lote "adicionar mais
 *   cortes" em andamento para este projeto.
 */
export default async function AddClipsToProjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  const [project, activeBatch] = await Promise.all([
    db.uploadedFile.findUnique({
      where: { id, userId },
      include: { clips: true },
    }),
    db.projectProcessingBatch.findFirst({
      where: { uploadedFileId: id, status: { in: ["queued", "processing"] } },
    }),
  ]);

  if (!project) redirect("/dashboard/projects");

  const blockedReason = (() => {
    if (project.sourceType !== "YOUTUBE" || !project.youtubeUrl) {
      return new UnsupportedAppendSourceError().message;
    }
    if (
      project.clips.some(
        (clip) => clip.sourceStartTime == null || clip.sourceEndTime == null,
      )
    ) {
      return new LegacyClipsMissingSourceRangeError().message;
    }
    if (activeBatch) {
      return new ProjectBatchInProgressError().message;
    }
    return null;
  })();

  const backLink = (
    <Link
      href={`/dashboard/projects/${id}`}
      className="inline-flex items-center text-sm text-[var(--fumaca)] hover:text-[var(--marfim)]"
    >
      <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o projeto
    </Link>
  );

  if (blockedReason) {
    return (
      <div className="w-full space-y-6 p-4 md:p-6">
        {backLink}
        <div
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-400"
        >
          {blockedReason}
        </div>
      </div>
    );
  }

  const usedRanges: TimeRange[] = project.clips.map((clip) => ({
    start: clip.sourceStartTime!,
    end: clip.sourceEndTime!,
  }));

  const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });

  return (
    <div className="w-full space-y-6 p-4 md:p-6">
      {backLink}
      <AddClipsToProjectClient
        projectId={project.id}
        projectName={project.displayName || project.id}
        youtubeUrl={project.youtubeUrl!}
        thumbnailUrl={project.thumbnailUrl}
        videoDurationSeconds={project.durationSeconds}
        usedRanges={usedRanges}
        userCredits={user?.credits ?? 0}
      />
    </div>
  );
}
