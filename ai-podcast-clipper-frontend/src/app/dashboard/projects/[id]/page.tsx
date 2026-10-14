import { redirect } from "next/navigation";
import Link from "next/link";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { AlertTriangle, ArrowLeft, Clock, Film, Loader2, Plus, Search, X } from "lucide-react";
import { isManualCut } from "~/domain/services/clip-origin.service";
import { formatClipsDurationLabel } from "~/domain/services/clip-duration.service";
import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";
import { ClipCard } from "~/components/clip-card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { OriginalVideoPopover } from "~/components/dashboard/original-video-popover";
import { ProjectBatchPoller } from "~/components/dashboard/project-batch-poller";
import { ClipGeneratingPlaceholder } from "~/components/dashboard/clip-generating-placeholder";
import {
  buildGeneratingPlaceholders,
  describeGeneratingBanner,
} from "~/lib/generating-batch-placeholders";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";

const CLIPS_PER_PAGE = 10;
const MAX_SEARCH_LENGTH = 100;

export default async function ProjectDetailsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const pageParam = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  // Busca server-side por título/gancho. Aparada e limitada para não gerar
  // `contains` gigantes; vazio equivale a "sem filtro".
  const query =
    typeof searchParams.q === "string"
      ? searchParams.q.trim().slice(0, MAX_SEARCH_LENGTH)
      : "";
  const clipsSearchFilter = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { hook: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  // A duração dos cortes não pode ser somada a partir de `project.clips`: essa
  // lista é paginada (CLIPS_PER_PAGE) e possivelmente filtrada pela busca, então
  // somar só ela daria um total errado. Por isso usamos um aggregate separado
  // sobre TODOS os clipes do projeto (ver clip-duration.service.ts). O mesmo
  // vale para `_count`, que continua sendo o total sem filtro.
  const [project, clipsDurationAggregate] = await Promise.all([
    db.uploadedFile.findUnique({
      where: { id, userId },
      include: {
        clips: {
          ...(clipsSearchFilter ? { where: clipsSearchFilter } : {}),
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
    }),
    db.clip.aggregate({
      where: { uploadedFileId: id },
      _sum: { durationSeconds: true },
    }),
  ]);

  if (!project) redirect("/dashboard/projects");

  // Feedback de lotes "adicionar cortes": ativos (queued/processing) + o lote
  // mais recente. A falha só é exibida se o lote MAIS RECENTE do projeto estiver
  // `failed` (sem notificação persistente: some quando um novo lote é criado).
  // Consulta só após confirmar que o projeto pertence ao usuário.
  const [activeBatches, latestBatch] = await Promise.all([
    db.projectProcessingBatch.findMany({
      where: { uploadedFileId: id, status: { in: ["queued", "processing"] } },
      orderBy: { createdAt: "asc" },
    }),
    db.projectProcessingBatch.findFirst({
      where: { uploadedFileId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const generatingPlaceholders = buildGeneratingPlaceholders(activeBatches);
  const hasActiveBatch = generatingPlaceholders.length > 0;
  const failedBatch =
    !hasActiveBatch && latestBatch?.status === "failed" ? latestBatch : null;
  // Placeholders ocupam o grid só na 1ª página sem busca (onde os cortes novos
  // entrariam, por ordem de criação desc); o banner aparece sempre.
  const showPlaceholders = hasActiveBatch && page === 1 && !query;

  const totalClips = project._count.clips;
  // Com busca ativa a paginação é calculada sobre a contagem filtrada.
  const filteredClips = clipsSearchFilter
    ? await db.clip.count({
        where: { uploadedFileId: id, ...clipsSearchFilter },
      })
    : totalClips;
  const totalPages = Math.ceil(filteredClips / CLIPS_PER_PAGE);
  const clipsDurationLabel = formatClipsDurationLabel(
    clipsDurationAggregate._sum.durationSeconds,
  );
  const originalVideoMinutes = Math.floor(project.durationSeconds / 60);

  // Proteção defensiva: `project.youtubeUrl` é, em teoria, sempre uma URL do
  // YouTube (projetos de upload direto têm esse campo null), mas validamos e
  // normalizamos via Value Object antes de transformar em link clicável —
  // nunca confiamos num valor de banco para montar um `href`. O `canonicalUrl`
  // é reconstruído só a partir do ID de vídeo extraído (regex fixa de 11
  // caracteres), então nunca reflete esquemas como `javascript:` ou domínios
  // arbitrários que porventura estejam no valor bruto.
  const validYoutubeUrl = project.youtubeUrl
    ? YouTubeUrl.tryCreate(project.youtubeUrl)
    : null;

  const hasOriginalVideo = Boolean(project.thumbnailUrl || project.youtubeUrl);

  const basePath = `/dashboard/projects/${id}`;
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(target));
    // URLSearchParams usa "+" para espaço; preferimos %20 (mais previsível).
    return `${basePath}?${params.toString().replace(/\+/g, "%20")}`;
  };

  return (
    <div className="w-full h-full space-y-8 p-4 md:p-6">
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center rounded text-sm text-[var(--fumaca)] hover:text-[var(--marfim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]"
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar para Projetos
      </Link>

      <header className="space-y-3 border-b border-[var(--linha)] pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--marfim)] break-words">
          {project.displayName || project.id}
        </h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--fumaca)]">
          <span
            className="flex items-center"
            title={`Vídeo original: ${originalVideoMinutes} min`}
          >
            <Clock className="mr-1.5 h-4 w-4" aria-hidden="true" /> {clipsDurationLabel}
          </span>
          <span className="flex items-center">
            <Film className="mr-1.5 h-4 w-4" aria-hidden="true" /> {totalClips} cortes gerados
          </span>
        </div>
      </header>

      <section aria-labelledby="clips-heading">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="clips-heading" className="text-xl font-bold text-[var(--marfim)]">
            Cortes Gerados
          </h2>

          {/* Toolbar à direita: [busca] [vídeo original] [adicionar cortes] */}
          <div
            data-testid="clips-toolbar"
            className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end"
          >
            <form
              method="get"
              action={basePath}
              role="search"
              className="relative w-full sm:w-64"
            >
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fumaca)]"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                maxLength={MAX_SEARCH_LENGTH}
                placeholder="Buscar cortes..."
                aria-label="Buscar cortes"
                data-testid="clips-search"
                className="h-9 border-[var(--linha)] bg-[var(--superficie)] pl-9 pr-9 text-[var(--marfim)] placeholder:text-[var(--fumaca)] focus-visible:ring-[var(--ouro)]/60"
              />
              {query && (
                <Link
                  href={basePath}
                  aria-label="Limpar busca"
                  data-testid="clips-search-clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--fumaca)] hover:text-[var(--marfim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </form>

            <div className="flex items-center gap-2">
              {hasOriginalVideo && (
                <OriginalVideoPopover
                  displayName={project.displayName}
                  durationMinutes={originalVideoMinutes}
                  thumbnailUrl={project.thumbnailUrl}
                  youtubeCanonicalUrl={validYoutubeUrl?.canonicalUrl ?? null}
                />
              )}

              {/*
                Botão "Adicionar cortes": `<Link>` real para a rota
                `/dashboard/projects/[id]/add-clips`. `data-testid`
                mantém o seletor estável pros testes. Com lote em geração
                vira botão `aria-disabled` (continua focável para o leitor de
                tela ouvir o motivo; sem navegação).
              */}
              {hasActiveBatch ? (
                <>
                  <Button
                    type="button"
                    size="lg"
                    aria-disabled="true"
                    aria-describedby="add-clips-disabled-reason"
                    title="Aguarde os cortes em geração terminarem"
                    data-testid="add-clips-slot"
                    className="flex-1 cursor-not-allowed bg-[var(--ouro)] text-black opacity-50 hover:bg-[var(--ouro)] focus-visible:ring-[var(--ouro)]/60 sm:flex-none"
                  >
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Adicionar cortes
                  </Button>
                  <span id="add-clips-disabled-reason" className="sr-only">
                    Aguarde os cortes em geração terminarem
                  </span>
                </>
              ) : (
                <Button
                  asChild
                  size="lg"
                  className="flex-1 bg-[var(--ouro)] text-black hover:bg-[var(--ouro)]/90 focus-visible:ring-[var(--ouro)]/60 sm:flex-none"
                >
                  <Link href={`${basePath}/add-clips`} data-testid="add-clips-slot">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Adicionar cortes
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        <ProjectBatchPoller activeCount={generatingPlaceholders.length} />

        {hasActiveBatch && (
          <div
            data-testid="clips-generating-banner"
            className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--ouro)]/40 bg-[var(--ouro)]/10 px-4 py-3 text-sm text-[var(--marfim)]"
          >
            <Loader2
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ouro)] motion-safe:animate-spin"
              aria-hidden="true"
            />
            <p>
              <span className="font-semibold">
                {describeGeneratingBanner(generatingPlaceholders)}
              </span>{" "}
              Isso pode levar alguns minutos. A página atualiza sozinha.
            </p>
          </div>
        )}

        {failedBatch && (
          <div
            role="alert"
            data-testid="clips-batch-failed-alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-[var(--marfim)]"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-semibold">Não foi possível gerar os cortes adicionados.</p>
              {failedBatch.errorMessage && <p>{failedBatch.errorMessage}</p>}
              <p className="text-[var(--prata)]">
                {failedBatch.creditsCost > 0
                  ? `Os ${failedBatch.creditsCost} créditos reservados para este lote foram devolvidos. `
                  : "Nenhum crédito foi cobrado por este lote. "}
                Os cortes existentes não foram afetados; você pode tentar adicionar novamente.
              </p>
            </div>
          </div>
        )}

        {totalClips === 0 && !showPlaceholders ? (
          <div className="py-20 text-center text-[var(--fumaca)] border border-dashed border-[var(--linha)] rounded-xl">
            {project.status === "processing" || project.status === "queued"
              ? "O projeto está sendo processado. Os cortes aparecerão aqui em breve."
              : project.status === "failed"
                ? ("Falha ao processar o projeto. " + (project.errorMessage || "")).trim()
                : "Nenhum corte gerado."}
          </div>
        ) : filteredClips === 0 && !showPlaceholders ? (
          <div
            data-testid="clips-search-empty"
            className="py-20 text-center text-[var(--fumaca)] border border-dashed border-[var(--linha)] rounded-xl"
          >
            <p>Nenhum corte encontrado para &lsquo;{query}&rsquo;.</p>
            <Link
              href={basePath}
              className="mt-3 inline-block rounded text-[var(--prata)] underline underline-offset-2 hover:text-[var(--ouro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]"
            >
              Limpar busca
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {showPlaceholders &&
                generatingPlaceholders.map((placeholder) => (
                  <ClipGeneratingPlaceholder
                    key={placeholder.key}
                    placeholder={placeholder}
                  />
                ))}
              {project.clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  isManual={isManualCut(clip, project)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={page > 1 ? pageHref(page - 1) : "#"}
                        className={page === 1 ? "pointer-events-none opacity-50" : ""}
                        aria-disabled={page === 1}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          href={pageHref(i + 1)}
                          isActive={page === i + 1}
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href={page < totalPages ? pageHref(page + 1) : "#"}
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
      </section>
    </div>
  );
}
