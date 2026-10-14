/**
 * @vitest-environment node
 *
 * Teste de integração (bugfix 2026-10-14): um projeto do YouTube criado com
 * cortes manuais pelo fluxo NORMAL (`processVideoHandler`) precisa sair com
 * `Clip.sourceStartTime`/`sourceEndTime` gravados no Postgres — senão o
 * "Adicionar cortes" o trata como projeto legado
 * (`LegacyClipsMissingSourceRangeError`).
 *
 * Handler real, `db` real dentro da transação de teste, use cases de
 * crédito reais. Só `undici.fetch` (backend Python) e o cliente do Inngest
 * são mockados — mesmo padrão de `append-clips-to-project.integration.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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
    createFunction: () => ({}),
  },
}));

import { fetch as undiciFetch } from "undici";
import { makeAddClipsToProjectUseCase } from "~/infrastructure/factories/use-case-factories";
import { processVideoHandler, type PipelineStep } from "~/inngest/functions";

describe("processVideo — tempo no vídeo ORIGINAL dos clipes — Integração (Postgres real)", () => {
  useRollbackTransactionPerTest();

  const trivialStep: PipelineStep = {
    run: (async (_name: string, fn: () => unknown) => await fn()) as unknown as PipelineStep["run"],
  };

  const manualCuts = [{ id: "cut-1", title: "Momento", startTime: 193, endTime: 253 }];

  async function createUser() {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return db.user.create({
      data: {
        id: `user_source_range_it_${suffix}`,
        email: `source-range-it-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        oneTimeCredits: 100,
        subscriptionCredits: 0,
        reservedCredits: 0,
      },
    });
  }

  function mockBackend() {
    vi.mocked(undiciFetch).mockImplementation((async (url: RequestInfo, init?: unknown) => {
      const urlStr = url.toString();
      if (urlStr.includes("download")) {
        const body = JSON.parse((init as { body: string }).body) as { s3_key: string };
        return new Response(
          JSON.stringify({
            success: true,
            s3_key: body.s3_key,
            title: "Video",
            duration: 3600,
            thumbnail: null,
            remapped_ranges: [{ original_start: 191, original_end: 255, offset_in_output: 0 }],
            remapped_cuts: [
              { original_start: 193, original_end: 253, new_start: 2, new_end: 62, title: "Momento" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === "https://modal.run/process-video") {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: "whatever",
            clips: [{ title: "Momento", s3_key: "clips/source-range/clip_0.mp4", start: 2, end: 62, duration: 60 }],
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

  it("projeto YouTube com corte manual grava o tempo original e passa a aceitar 'Adicionar cortes'", async () => {
    const user = await createUser();
    const project = await db.uploadedFile.create({
      data: {
        userId: user.id,
        s3Key: `youtube/${Date.now()}-source-range/original.mp4`,
        displayName: "Projeto com corte manual",
        sourceType: "YOUTUBE",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 0,
        status: "queued",
        subtitlePreset: "HORMOZI",
        manualCutsJson: JSON.stringify(manualCuts),
      },
    });

    mockBackend();
    await processVideoHandler({
      event: {
        data: { uploadedFileId: project.id, userId: user.id, preset: "HORMOZI", mode: "manual", manualCuts },
      },
      step: trivialStep,
    });

    const clips = await db.clip.findMany({ where: { uploadedFileId: project.id } });
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      startTime: 2,
      endTime: 62,
      sourceStartTime: 193,
      sourceEndTime: 253,
    });

    // Antes do fix, este passo lançava LegacyClipsMissingSourceRangeError.
    const result = await makeAddClipsToProjectUseCase().execute({
      projectId: project.id,
      userId: user.id,
      mode: "manual",
      manualCuts: [{ title: "Corte novo", startTime: 400, endTime: 430 }],
    });
    expect(result.success).toBe(true);
  });
});
