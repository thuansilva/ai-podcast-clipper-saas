/**
 * @vitest-environment node
 *
 * Teste de integração: exercita o fluxo completo de "adicionar mais
 * cortes" a um projeto já existente — `AddClipsToProjectUseCase` (real,
 * repositórios Prisma reais) + `appendClipsToProjectHandler` (real,
 * `db` real dentro da transação de teste, use cases de crédito reais via
 * `use-case-factories`). Só o SDK de rede para o backend Python
 * (`undici.fetch`) e o cliente do Inngest são mockados — nunca uma
 * dependência externa real em teste, mesmo padrão de
 * `tests/integration/actions/youtube-actions.integration.test.ts`.
 *
 * Cobre, com Postgres de verdade (ver AGENTS.md — TDD + unitário E
 * integração):
 * - Projeto com clipe já existente recebe um append manual: clipe antigo
 *   continua intacto, clipe novo é criado com `sourceStartTime`/
 *   `sourceEndTime` corretos (tempo no vídeo ORIGINAL), só o incremento é
 *   cobrado (nunca o processamento original de novo).
 * - Sobreposição manual com um clipe já existente é BLOQUEADA.
 * - Um lote que falha (backend retorna 500) nunca marca o projeto como
 *   failed nem apaga clipes de outros lotes — só o próprio lote fica
 *   failed, e o crédito reservado desse lote é devolvido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

vi.mock("undici", () => ({
  Agent: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    PROCESS_VIDEO_ENDPOINT: "https://modal.run/process-video",
    AUTH_TOKEN: "mock-token",
    S3_BUCKET_NAME: "mock-bucket",
  },
}));

const mockInngestSend = vi.fn();
vi.mock("~/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
    // `src/inngest/functions.ts` chama `inngest.createFunction(...)` no
    // nível de módulo para TODAS as functions exportadas (processVideo,
    // appendClipsToProject, etc.) — precisa existir mesmo não sendo
    // exercitado por este teste (que chama `appendClipsToProjectHandler`
    // diretamente, não via Inngest de verdade).
    createFunction: () => ({}),
  },
}));

import { fetch as undiciFetch } from "undici";
import {
  makeAddClipsToProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { appendClipsToProjectHandler, type PipelineStep } from "~/inngest/functions";
import { ManualCutOverlapError } from "~/domain/errors/manual-cut-overlap-error";
import type { AddClipsToProjectEventData } from "~/application/dtos/video-dtos";

describe("Adicionar mais cortes a um projeto existente — Integração (Postgres real)", () => {
  useRollbackTransactionPerTest();

  const trivialStep: PipelineStep = {
    run: (async (_name: string, fn: () => unknown) => await fn()) as unknown as PipelineStep["run"],
  };

  async function createUser(overrides: { credits?: number } = {}) {
    return db.user.create({
      data: {
        id: `user_append_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `append-it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits: overrides.credits ?? 100,
        oneTimeCredits: overrides.credits ?? 100,
        subscriptionCredits: 0,
        reservedCredits: 0,
      },
    });
  }

  async function createYouTubeProject(userId: string) {
    return db.uploadedFile.create({
      data: {
        userId,
        s3Key: `youtube/${Date.now()}-project/original.mp4`,
        displayName: "Projeto existente",
        sourceType: "YOUTUBE",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 3600,
        creditsCost: 60,
        status: "processed",
        subtitlePreset: "HORMOZI",
        genre: "humor",
        aspectRatio: "9:16",
        autoZoom: true,
      },
    });
  }

  function mockBackendResponses({
    downloadRemappedRanges,
    downloadRemappedCuts,
    processVideoStatus = 200,
    processVideoClips = [],
  }: {
    downloadRemappedRanges?: unknown;
    downloadRemappedCuts?: unknown;
    processVideoStatus?: number;
    processVideoClips?: unknown[];
  }) {
    vi.mocked(undiciFetch).mockImplementation((async (
      url: RequestInfo,
      init?: unknown,
    ) => {
      const urlStr = url.toString();
      if (urlStr.includes("download")) {
        const body = JSON.parse((init as { body: string }).body) as {
          s3_key: string;
        };
        return new Response(
          JSON.stringify({
            success: true,
            s3_key: body.s3_key,
            title: "Video",
            duration: 3600,
            thumbnail: null,
            remapped_ranges: downloadRemappedRanges,
            remapped_cuts: downloadRemappedCuts,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === "https://modal.run/process-video") {
        if (processVideoStatus !== 200) {
          return new Response("GPU boom", { status: processVideoStatus });
        }
        return new Response(
          JSON.stringify({
            success: true,
            file_id: "whatever",
            clips: processVideoClips,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as any);
  }

  afterEach(() => {
    vi.mocked(undiciFetch).mockReset();
    mockInngestSend.mockReset();
  });

  it("append manual: preserva o clipe antigo, cria o clipe novo com sourceStartTime/sourceEndTime corretos e cobra só o incremento", async () => {
    const user = await createUser({ credits: 100 });
    const project = await createYouTubeProject(user.id);

    await db.clip.create({
      data: {
        userId: user.id,
        uploadedFileId: project.id,
        s3Key: "clips/project/clip_0.mp4",
        title: "Clip antigo",
        startTime: 0,
        endTime: 30,
        sourceStartTime: 0,
        sourceEndTime: 30,
        durationSeconds: 30,
        transcriptWords: [],
      },
    });

    // 1) Server-side: cria o lote via o use case real (Prisma real).
    const useCase = makeAddClipsToProjectUseCase();
    const manualCuts = [{ title: "Corte novo", startTime: 200, endTime: 230 }];
    const result = await useCase.execute({
      projectId: project.id,
      userId: user.id,
      mode: "manual",
      manualCuts,
    });

    expect(result.success).toBe(true);
    const batchId = result.batchId;

    const batchAfterCreate = await db.projectProcessingBatch.findUnique({
      where: { id: batchId },
    });
    expect(batchAfterCreate?.status).toBe("queued");
    expect(batchAfterCreate?.mode).toBe("manual");

    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    const sentEvent = mockInngestSend.mock.calls[0]![0] as {
      name: string;
      data: AddClipsToProjectEventData;
    };
    expect(sentEvent.name).toBe("append-clips-events");
    expect(sentEvent.data).toEqual({
      uploadedFileId: project.id,
      batchId,
      userId: user.id,
      mode: "manual",
      manualCuts,
      aiSlice: undefined,
      excludedRanges: [],
    });

    // 2) Worker: processa o evento de verdade (handler real, db real).
    mockBackendResponses({
      downloadRemappedRanges: [
        { original_start: 198, original_end: 232, offset_in_output: 0 },
      ],
      downloadRemappedCuts: [
        {
          original_start: 200,
          original_end: 230,
          new_start: 2,
          new_end: 32,
          title: "Corte novo",
        },
      ],
      processVideoClips: [
        {
          title: "Corte novo",
          s3_key: "clips/project/clip_1.mp4",
          start: 2,
          end: 32,
          duration: 30,
        },
      ],
    });

    const handlerResult = await appendClipsToProjectHandler({
      event: { data: sentEvent.data },
      step: trivialStep,
    });

    expect(handlerResult.success).toBe(true);

    // Clipe antigo intacto.
    const allClips = await db.clip.findMany({
      where: { uploadedFileId: project.id },
      orderBy: { startTime: "asc" },
    });
    expect(allClips).toHaveLength(2);
    expect(allClips[0]).toMatchObject({
      title: "Clip antigo",
      startTime: 0,
      endTime: 30,
      sourceStartTime: 0,
      sourceEndTime: 30,
    });
    expect(allClips[1]).toMatchObject({
      title: "Corte novo",
      startTime: 2,
      endTime: 32,
      sourceStartTime: 200,
      sourceEndTime: 230,
    });

    // Projeto (UploadedFile) nunca é tocado pelo lote.
    const projectAfter = await db.uploadedFile.findUnique({
      where: { id: project.id },
    });
    expect(projectAfter?.status).toBe("processed");
    expect(projectAfter?.creditsCost).toBe(60);
    expect(projectAfter?.s3Key).toBe(project.s3Key);

    // Lote concluído, cobrança só do incremento (30s -> 1 crédito).
    const batchAfter = await db.projectProcessingBatch.findUnique({
      where: { id: batchId },
    });
    expect(batchAfter?.status).toBe("processed");
    expect(batchAfter?.creditsCost).toBe(1);

    const userAfter = await db.user.findUnique({ where: { id: user.id } });
    expect(userAfter?.credits).toBe(99);
    expect(userAfter?.reservedCredits).toBe(0);
  });

  it("bloqueia (não só avisa) um corte manual novo que se sobrepõe a um clipe já existente", async () => {
    const user = await createUser();
    const project = await createYouTubeProject(user.id);

    await db.clip.create({
      data: {
        userId: user.id,
        uploadedFileId: project.id,
        s3Key: "clips/project/clip_0.mp4",
        title: "Clip antigo",
        startTime: 0,
        endTime: 30,
        sourceStartTime: 100,
        sourceEndTime: 130,
        durationSeconds: 30,
        transcriptWords: [],
      },
    });

    const useCase = makeAddClipsToProjectUseCase();

    await expect(
      useCase.execute({
        projectId: project.id,
        userId: user.id,
        mode: "manual",
        manualCuts: [{ startTime: 110, endTime: 140 }],
      }),
    ).rejects.toThrow(ManualCutOverlapError);

    expect(mockInngestSend).not.toHaveBeenCalled();
    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId: project.id },
    });
    expect(batches).toHaveLength(0);
  });

  it("lote que falha (backend GPU retorna 500) marca só o lote como failed, devolve o crédito reservado e nunca deleta clipes nem altera o projeto", async () => {
    const user = await createUser({ credits: 100 });
    const project = await createYouTubeProject(user.id);

    await db.clip.create({
      data: {
        userId: user.id,
        uploadedFileId: project.id,
        s3Key: "clips/project/clip_0.mp4",
        title: "Clip antigo",
        startTime: 0,
        endTime: 30,
        sourceStartTime: 0,
        sourceEndTime: 30,
        durationSeconds: 30,
        transcriptWords: [],
      },
    });

    const useCase = makeAddClipsToProjectUseCase();
    const manualCuts = [{ startTime: 400, endTime: 430 }];
    const result = await useCase.execute({
      projectId: project.id,
      userId: user.id,
      mode: "manual",
      manualCuts,
    });
    const batchId = result.batchId;

    const sentEvent = mockInngestSend.mock.calls[0]![0] as {
      data: AddClipsToProjectEventData;
    };

    mockBackendResponses({
      downloadRemappedRanges: [
        { original_start: 398, original_end: 432, offset_in_output: 0 },
      ],
      downloadRemappedCuts: [
        { original_start: 400, original_end: 430, new_start: 2, new_end: 32 },
      ],
      processVideoStatus: 500,
    });

    const handlerResult = await appendClipsToProjectHandler({
      event: { data: sentEvent.data },
      step: trivialStep,
    });

    expect(handlerResult.success).toBe(false);

    // Só o lote fica failed.
    const batchAfter = await db.projectProcessingBatch.findUnique({
      where: { id: batchId },
    });
    expect(batchAfter?.status).toBe("failed");
    expect(batchAfter?.errorMessage).toBeTruthy();

    // Projeto intacto.
    const projectAfter = await db.uploadedFile.findUnique({
      where: { id: project.id },
    });
    expect(projectAfter?.status).toBe("processed");

    // Nenhum clipe novo criado, o antigo continua lá.
    const allClips = await db.clip.findMany({
      where: { uploadedFileId: project.id },
    });
    expect(allClips).toHaveLength(1);
    expect(allClips[0]?.title).toBe("Clip antigo");

    // Crédito do lote devolvido (hold de 1 crédito revertido).
    const userAfter = await db.user.findUnique({ where: { id: user.id } });
    expect(userAfter?.credits).toBe(100);
    expect(userAfter?.reservedCredits).toBe(0);
  });

  it("idempotência por lote: o mesmo evento entregue 2x (retry/replay) cobra e cria clipes uma única vez", async () => {
    const user = await createUser({ credits: 100 });
    const project = await createYouTubeProject(user.id);

    const result = await makeAddClipsToProjectUseCase().execute({
      projectId: project.id,
      userId: user.id,
      mode: "manual",
      manualCuts: [{ title: "Corte novo", startTime: 200, endTime: 230 }],
    });
    const sentEvent = mockInngestSend.mock.calls[0]![0] as {
      id?: string;
      data: AddClipsToProjectEventData;
    };
    // Dedupe na origem: id determinístico por lote.
    expect(sentEvent.id).toBe(`append-clips-${result.batchId}`);

    mockBackendResponses({
      downloadRemappedRanges: [
        { original_start: 198, original_end: 232, offset_in_output: 0 },
      ],
      downloadRemappedCuts: [
        { original_start: 200, original_end: 230, new_start: 2, new_end: 32, title: "Corte novo" },
      ],
      processVideoClips: [
        { title: "Corte novo", s3_key: "clips/project/clip_1.mp4", start: 2, end: 32, duration: 30 },
      ],
    });

    const first = await appendClipsToProjectHandler({
      event: { data: sentEvent.data },
      step: trivialStep,
    });
    expect(first.success).toBe(true);

    const second = await appendClipsToProjectHandler({
      event: { data: sentEvent.data },
      step: trivialStep,
    });
    expect(second.success).toBe(false);

    const clips = await db.clip.findMany({ where: { uploadedFileId: project.id } });
    expect(clips).toHaveLength(1);

    const batchAfter = await db.projectProcessingBatch.findUnique({
      where: { id: result.batchId },
    });
    expect(batchAfter?.status).toBe("processed");
    expect(batchAfter?.creditsCost).toBe(1);

    const userAfter = await db.user.findUnique({ where: { id: user.id } });
    expect(userAfter?.credits).toBe(99);
    expect(userAfter?.reservedCredits).toBe(0);
  });
});
