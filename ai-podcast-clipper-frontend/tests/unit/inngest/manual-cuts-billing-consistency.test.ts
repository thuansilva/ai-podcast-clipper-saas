/**
 * Auditoria de segurança (Fase 3) do contrato v2 de `POST /process_video`.
 *
 * Brecha coberta: `buildProcessVideoPayload` deriva `mode` da PRESENÇA de
 * cortes (D6), mas a reserva de créditos em `validate-and-reserve-credits`
 * só usava o preço manual quando `event.data.mode === "manual"`. Um usuário
 * autenticado chamando a Server Action diretamente (`processVideo` /
 * `importYouTubeVideo`) com `mode` omitido ou `"auto"` + até 50 cortes
 * fazia o crédito ser reservado pelo preço AUTOMÁTICO (duração do vídeo,
 * ex.: 1 crédito para um vídeo de 1 min) enquanto o backend processava TODOS
 * os cortes em modo manual (até 50 clipes, sem o `clips_limit=5` do auto).
 *
 * Regra aplicada (espelha RN-PIPE-MANUAL-03 do backend, que já rejeita
 * `mode="auto"` + `manual_cuts`): cortes manuais exigem `mode="manual"`; a
 * combinação ambígua é erro explícito ANTES de reservar crédito e ANTES de
 * chamar o GPU.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processVideoHandler, type PipelineStep } from "~/inngest/functions";
import type { ManualCutDTO } from "~/application/dtos/video-dtos";

import { fetch as undiciFetch } from "undici";
vi.mock("undici", () => ({ Agent: vi.fn(), fetch: vi.fn() }));

vi.mock("~/env", () => ({
  env: {
    PROCESS_VIDEO_ENDPOINT: "https://modal.run/process-video",
    PROCESS_VIDEO_ENDPOINT_AUTH: "mock-token",
    S3_BUCKET_NAME: "mock-bucket",
  },
}));

const mockUploadedFileFindUniqueOrThrow = vi.fn();
const mockUploadedFileUpdate = vi.fn();
const mockUploadedFileFindUnique = vi.fn();
const mockClipCreateMany = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUniqueOrThrow: (...args: unknown[]) =>
        mockUploadedFileFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockUploadedFileUpdate(...args),
      findUnique: (...args: unknown[]) => mockUploadedFileFindUnique(...args),
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

const createStep = (): PipelineStep => ({
  run: vi.fn(
    async (_name: string, fn: () => unknown) => await fn(),
  ) as unknown as PipelineStep["run"],
});

// 50 cortes de 60s sobre um vídeo de 60s (sobreposição é permitida, D4):
// preço manual = 50 créditos; preço automático = 1 crédito.
const FIFTY_CUTS: ManualCutDTO[] = Array.from({ length: 50 }, (_, i) => ({
  title: `Corte ${i + 1}`,
  startTime: 0,
  endTime: 60,
}));

describe("processVideoHandler — coerência cobrança × modo efetivamente processado", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUploadedFileFindUniqueOrThrow.mockResolvedValue({
      id: "file-1",
      userId: "user-1",
      s3Key: "uploads/file-1/video.mp4",
      durationSeconds: 60,
      sourceType: "UPLOAD",
      status: "queued",
      displayName: "podcast.mp4",
      sliceStartTime: 0,
      sliceEndTime: 0,
      manualCutsJson: null,
      subtitlePreset: "HORMOZI",
      genre: null,
      aspectRatio: null,
      autoZoom: null,
      clipModel: null,
      user: { id: "user-1", plan: "STARTER" },
    });
    mockUploadedFileFindUnique.mockResolvedValue({
      userId: "user-1",
      creditsCost: 0,
      status: "queued",
    });
    mockUserFindUnique.mockResolvedValue({ reservedCredits: 0 });
    mockHoldCreditsExecute.mockResolvedValue({ success: true, heldCredits: 1 });
    mockConsumeCreditsExecute.mockResolvedValue({ success: true });
    mockUploadedFileUpdate.mockResolvedValue({});
    mockClipCreateMany.mockResolvedValue({ count: 0 });
    vi.mocked(undiciFetch).mockImplementation((async () =>
      new Response(JSON.stringify({ success: true, file_id: "x", clips: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any);
  });

  it.each([
    ["omitido", undefined],
    ["'auto'", "auto" as const],
  ])(
    "rejeita cortes manuais com mode %s antes de reservar crédito e antes de chamar o GPU",
    async (_label, mode) => {
      const result = await processVideoHandler({
        event: {
          data: {
            uploadedFileId: "file-1",
            userId: "user-1",
            preset: "HORMOZI",
            mode,
            manualCuts: FIFTY_CUTS,
          },
        },
        step: createStep(),
      });

      expect(result.success).toBe(false);
      expect(mockHoldCreditsExecute).not.toHaveBeenCalled();
      expect(undiciFetch).not.toHaveBeenCalled();
    },
  );

  it("guard verde: mode='manual' + cortes reserva pelo preço manual e envia mode='manual'", async () => {
    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts: FIFTY_CUTS,
        },
      },
      step: createStep(),
    });

    expect(mockHoldCreditsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50 }),
    );
    const body = JSON.parse(
      (vi.mocked(undiciFetch).mock.calls[0]![1] as { body: string }).body,
    );
    expect(body.mode).toBe("manual");
    expect(body.manual_cuts).toHaveLength(50);
  });

  it("guard verde: modo auto sem cortes continua reservando pelo preço de duração", async () => {
    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "auto",
        },
      },
      step: createStep(),
    });

    expect(mockHoldCreditsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ amount: undefined }),
    );
    const body = JSON.parse(
      (vi.mocked(undiciFetch).mock.calls[0]![1] as { body: string }).body,
    );
    expect(body.mode).toBe("auto");
  });
});
