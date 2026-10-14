import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  appendClipsToProjectHandler,
  type PipelineStep,
} from "~/inngest/functions";
import { env } from "~/env";
import { Prisma } from "@prisma/client";
import { calculateManualCutsCredits } from "~/domain/services/credit-pricing.service";

import { fetch as undiciFetch } from "undici";
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

const mockUploadedFileFindUniqueOrThrow = vi.fn();
const mockBatchFindUniqueOrThrow = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchUpdateMany = vi.fn();
const mockClipCreateMany = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUniqueOrThrow: (...args: unknown[]) =>
        mockUploadedFileFindUniqueOrThrow(...args),
    },
    projectProcessingBatch: {
      findUniqueOrThrow: (...args: unknown[]) =>
        mockBatchFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockBatchUpdate(...args),
      updateMany: (...args: unknown[]) => mockBatchUpdateMany(...args),
    },
    clip: {
      createMany: (...args: unknown[]) => mockClipCreateMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

const mockHoldCreditsExecute = vi.fn();
const mockConsumeCreditsExecute = vi.fn();
const mockRefundCreditsExecute = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeHoldCreditsUseCase: () => ({ execute: mockHoldCreditsExecute }),
  makeConsumeCreditsUseCase: () => ({ execute: mockConsumeCreditsExecute }),
  makeRefundCreditsUseCase: () => ({ execute: mockRefundCreditsExecute }),
}));

describe("Inngest Append Clips To Project Pipeline (Unit)", () => {
  const createMockStep = (): PipelineStep => ({
    run: vi.fn(async (_name: string, fn: () => unknown) => await fn()) as unknown as PipelineStep["run"],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUploadedFileFindUniqueOrThrow.mockResolvedValue({
      id: "file-123",
      userId: "user-456",
      s3Key: "youtube/old-uuid/original.mp4",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sourceType: "YOUTUBE",
      subtitlePreset: "HORMOZI",
      genre: "humor",
      aspectRatio: "9:16",
      autoZoom: true,
      status: "processed",
    });

    mockBatchFindUniqueOrThrow.mockResolvedValue({
      id: "batch-1",
      uploadedFileId: "file-123",
      mode: "manual",
      status: "queued",
    });

    mockHoldCreditsExecute.mockResolvedValue({ success: true, heldCredits: 1 });
    mockConsumeCreditsExecute.mockResolvedValue({ success: true });
    mockBatchUpdate.mockResolvedValue({});
    mockBatchUpdateMany.mockResolvedValue({ count: 1 });
    mockClipCreateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("modo manual: baixa só o corte novo numa chave S3 nova, reserva crédito proporcional, envia manual_cuts remapeados e persiste sourceStartTime/sourceEndTime", async () => {
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
            remapped_ranges: [
              { original_start: 198, original_end: 232, offset_in_output: 0 },
            ],
            remapped_cuts: [
              {
                original_start: 200,
                original_end: 230,
                new_start: 2,
                new_end: 32,
                title: "Corte novo",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: "whatever",
            clips: [
              {
                title: "Corte novo",
                s3_key: "clips/old-uuid/clip_0.mp4",
                start: 2,
                end: 32,
                duration: 30,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as any);

    const manualCuts = [{ title: "Corte novo", startTime: 200, endTime: 230 }];

    const result = await appendClipsToProjectHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          batchId: "batch-1",
          userId: "user-456",
          mode: "manual",
          manualCuts,
          excludedRanges: [],
        },
      },
      step: createMockStep(),
    });

    expect(result.success).toBe(true);

    // Reserva de crédito proporcional só ao corte novo (30s -> 1 crédito).
    // `skipFileStatusUpdate: true`: nunca sobrescreve o creditsCost do
    // projeto (`UploadedFile`) com o custo deste lote.
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      durationSeconds: 30,
      fileId: "file-123",
      amount: calculateManualCutsCredits(manualCuts),
      skipFileStatusUpdate: true,
    });

    // Download chamado com uma s3Key NOVA (nunca a do projeto).
    const downloadCall = vi.mocked(undiciFetch).mock.calls.find((c) =>
      c[0]!.toString().includes("download"),
    )!;
    const downloadBody = JSON.parse((downloadCall[1] as { body: string }).body) as {
      s3_key: string;
      manual_cuts: unknown;
    };
    expect(downloadBody.s3_key).not.toBe("youtube/old-uuid/original.mp4");
    expect(downloadBody.s3_key).toMatch(/^youtube\/.+\/original\.mp4$/);
    expect(downloadBody.manual_cuts).toEqual([
      { title: "Corte novo", start: 200, end: 230 },
    ]);

    // /process_video enviado com a chave do LOTE (devolvida pelo download), cortes remapeados.
    const processCall = vi.mocked(undiciFetch).mock.calls.find(
      (c) => c[0] === env.PROCESS_VIDEO_ENDPOINT,
    )!;
    const processBody = JSON.parse((processCall[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(processBody.s3_key).toBe(downloadBody.s3_key);
    expect(processBody.mode).toBe("manual");
    expect(processBody.manual_cuts).toEqual([
      { title: "Corte novo", start: 2, end: 32 },
    ]);
    expect(processBody).not.toHaveProperty("excluded_ranges");

    // Clipe novo persistido com sourceStartTime/sourceEndTime no tempo ORIGINAL.
    expect(mockClipCreateMany).toHaveBeenCalledTimes(1);
    const clipData = (mockClipCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> }).data;
    expect(clipData[0]).toMatchObject({
      uploadedFileId: "file-123",
      userId: "user-456",
      startTime: 2,
      endTime: 32,
      sourceStartTime: 200,
      sourceEndTime: 230,
    });

    // Consumo de créditos e finalização do LOTE (não do projeto).
    expect(mockConsumeCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      amount: 1,
      heldAmount: 1,
      fileId: "file-123",
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({ status: "processed" }),
      }),
    );
  });

  it("modo auto (IA sobre um slice): baixa só o slice, remapeia excludedRanges para o tempo do arquivo baixado e persiste sourceStartTime/sourceEndTime convertidos de volta ao original", async () => {
    mockBatchFindUniqueOrThrow.mockResolvedValue({
      id: "batch-2",
      uploadedFileId: "file-123",
      mode: "auto",
      status: "queued",
    });

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
            remapped_ranges: [
              { original_start: 198, original_end: 402, offset_in_output: 0 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: "whatever",
            clips: [
              {
                title: "Momento IA",
                hook: "gancho",
                virality_score: 9,
                reason: "motivo",
                s3_key: "clips/new-uuid/clip_0.mp4",
                start: 50,
                end: 80,
                duration: 30,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as any);

    const result = await appendClipsToProjectHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          batchId: "batch-2",
          userId: "user-456",
          mode: "auto",
          aiSlice: { startTime: 200, endTime: 400 },
          excludedRanges: [
            { start: 200, end: 210 },
            { start: 250, end: 270 },
          ],
        },
      },
      step: createMockStep(),
    });

    expect(result.success).toBe(true);

    // Hold proporcional ao slice (200s -> 4 créditos), sem `amount` explícito (preço automático).
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      durationSeconds: 200,
      fileId: "file-123",
      amount: undefined,
      skipFileStatusUpdate: true,
    });

    const downloadCall = vi.mocked(undiciFetch).mock.calls.find((c) =>
      c[0]!.toString().includes("download"),
    )!;
    const downloadBody = JSON.parse((downloadCall[1] as { body: string }).body) as {
      slice: { start: number; end: number };
    };
    expect(downloadBody.slice).toEqual({ start: 200, end: 400 });

    const processCall = vi.mocked(undiciFetch).mock.calls.find(
      (c) => c[0] === env.PROCESS_VIDEO_ENDPOINT,
    )!;
    const processBody = JSON.parse((processCall[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(processBody.mode).toBe("auto");
    // excludedRanges remapeados: offset_in_output=0, original_start=198
    // -> [200,210] => [2,12]; [250,270] => [52,72]
    expect(processBody.excluded_ranges).toEqual([
      { start: 2, end: 12 },
      { start: 52, end: 72 },
    ]);
    expect(processBody).not.toHaveProperty("manual_cuts");

    const clipData = (mockClipCreateMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> }).data;
    // Clipe devolvido em [50,80] (tempo do arquivo baixado) -> original = 198 + t
    expect(clipData[0]).toMatchObject({
      startTime: 50,
      endTime: 80,
      sourceStartTime: 248,
      sourceEndTime: 278,
    });
  });

  it("falha após o hold: reembolsa só o crédito do LOTE, marca só o lote como failed e nunca toca no UploadedFile", async () => {
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
            remapped_ranges: [
              { original_start: 198, original_end: 232, offset_in_output: 0 },
            ],
            remapped_cuts: [
              {
                original_start: 200,
                original_end: 230,
                new_start: 2,
                new_end: 32,
                title: "Corte novo",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response("GPU boom", { status: 500 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any);

    mockUserFindUnique.mockResolvedValue({ reservedCredits: 1 });

    const result = await appendClipsToProjectHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          batchId: "batch-1",
          userId: "user-456",
          mode: "manual",
          manualCuts: [{ title: "Corte novo", startTime: 200, endTime: 230 }],
          excludedRanges: [],
        },
      },
      step: createMockStep(),
    });

    expect(result.success).toBe(false);

    expect(mockRefundCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      amount: 1,
      fileId: "file-123",
      reason: expect.any(String),
      skipFileStatusUpdate: true,
    });

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );

    // Nunca toca no UploadedFile (nem status, nem s3Key do projeto).
    const { db } = await import("~/server/db");
    expect((db.uploadedFile as unknown as { update?: unknown }).update).toBeUndefined();
  });

  describe("idempotência por lote (auditoria de segurança)", () => {
    function mockManualBackendOk() {
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
              remapped_ranges: [
                { original_start: 198, original_end: 232, offset_in_output: 0 },
              ],
              remapped_cuts: [
                { original_start: 200, original_end: 230, new_start: 2, new_end: 32 },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
          return new Response(
            JSON.stringify({
              success: true,
              file_id: "whatever",
              clips: [{ title: "Corte", s3_key: "clips/x/clip_0.mp4", start: 2, end: 32, duration: 30 }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not Found", { status: 404 });
      }) as any);
    }

    const manualEvent = {
      uploadedFileId: "file-123",
      batchId: "batch-1",
      userId: "user-456",
      mode: "manual" as const,
      manualCuts: [{ startTime: 200, endTime: 230 }],
      excludedRanges: [],
    };

    it("reivindica o lote atomicamente (queued -> processing) num step próprio antes de qualquer download/hold", async () => {
      mockManualBackendOk();

      const step = createMockStep();
      const result = await appendClipsToProjectHandler({
        event: { data: manualEvent },
        step,
      });

      expect(result.success).toBe(true);
      expect(mockBatchUpdateMany).toHaveBeenCalledWith({
        where: { id: "batch-1", uploadedFileId: "file-123", status: "queued" },
        data: { status: "processing" },
      });
      const stepNames = vi.mocked(step.run).mock.calls.map((c) => c[0]);
      expect(stepNames[0]).toBe("claim-batch");
    });

    it("evento reentregue/duplicado para um lote que já não está queued: não baixa, não reserva/consome crédito, não cria clipes e não marca o lote como failed", async () => {
      mockManualBackendOk();
      mockBatchUpdateMany.mockResolvedValue({ count: 0 });

      const result = await appendClipsToProjectHandler({
        event: { data: manualEvent },
        step: createMockStep(),
      });

      expect(result.success).toBe(false);
      expect(result).toMatchObject({ skipped: true });
      expect(undiciFetch).not.toHaveBeenCalled();
      expect(mockHoldCreditsExecute).not.toHaveBeenCalled();
      expect(mockConsumeCreditsExecute).not.toHaveBeenCalled();
      expect(mockRefundCreditsExecute).not.toHaveBeenCalled();
      expect(mockClipCreateMany).not.toHaveBeenCalled();
      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });
  });

  it("modo auto: slice que ultrapassa o fim do vídeo é cobrado só até a duração real (nunca cobra segundos inexistentes)", async () => {
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
            remapped_ranges: [
              { original_start: 2998, original_end: 3600, offset_in_output: 0 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({ success: true, file_id: "whatever", clips: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as any);

    await appendClipsToProjectHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          batchId: "batch-2",
          userId: "user-456",
          mode: "auto",
          aiSlice: { startTime: 3000, endTime: 99999 },
          excludedRanges: [],
        },
      },
      step: createMockStep(),
    });

    expect(mockHoldCreditsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 600 }),
    );
  });
});
