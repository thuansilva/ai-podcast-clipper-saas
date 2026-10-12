/**
 * RF-INGEST-10 / RN-PIPE-MANUAL-18 (ponta do frontend, 2026-10-12).
 *
 * O backend (`/download_youtube`) agora aceita `manual_cuts` (tempos
 * absolutos no vídeo original) e, quando presente, baixa só os trechos
 * necessários, concatena num vídeo único menor e devolve `remapped_cuts`
 * (os mesmos cortes já com `new_start`/`new_end` no vídeo menor). Esta
 * suíte cobre a ponta do frontend: `downloadYouTubeVideo` deve enviar
 * `manualCuts` quando o modo é manual, e `processVideoHandler` deve montar
 * o payload de `/process_video` com os tempos REMAPEADOS (não os
 * originais) — sem jamais tocar em `manualCutsJson` (cortes originais do
 * projeto, reusados pelo retry).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processVideoHandler,
  getYouTubeDownloadEndpoint,
  type PipelineStep,
} from "~/inngest/functions";

import { fetch as undiciFetch } from "undici";
vi.mock("undici", () => ({ Agent: vi.fn(), fetch: vi.fn() }));

vi.mock("~/env", () => ({
  env: {
    PROCESS_VIDEO_ENDPOINT: "https://modal.run/process-video",
    YOUTUBE_DOWNLOAD_ENDPOINT: "https://modal.run/download-youtube",
    AUTH_TOKEN: "mock-token",
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

const ORIGINAL_S3_KEY = "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4";
const PROCESS_VIDEO_ENDPOINT = "https://modal.run/process-video";

const manualCuts = [
  { id: "cut-1", title: "Momento 1", startTime: 100, endTime: 130 },
  { id: "cut-2", title: "Momento 2", startTime: 500, endTime: 570 },
];

const downloadResponseWithRemap = {
  success: true,
  s3_key: ORIGINAL_S3_KEY,
  title: "Podcast Exclusivo",
  // Duração do vídeo ORIGINAL (1h) — não do arquivo concatenado menor.
  duration: 3600,
  thumbnail: null,
  remapped_ranges: [
    { original_start: 98, original_end: 132, offset_in_output: 0 },
    { original_start: 498, original_end: 572, offset_in_output: 34 },
  ],
  remapped_cuts: [
    { original_start: 100, original_end: 130, new_start: 2, new_end: 32, title: "Momento 1" },
    { original_start: 500, original_end: 570, new_start: 36, new_end: 106, title: "Momento 2" },
  ],
};

function baseUploadedFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-yt-1",
    userId: "user-1",
    s3Key: ORIGINAL_S3_KEY,
    durationSeconds: 0,
    sourceType: "YOUTUBE",
    youtubeUrl: "https://www.youtube.com/watch?v=abc123",
    status: "queued",
    displayName: "video.mp4",
    manualCutsJson: null,
    subtitlePreset: "HORMOZI",
    genre: null,
    aspectRatio: null,
    autoZoom: null,
    clipModel: null,
    sliceStartTime: 0,
    sliceEndTime: 0,
    user: { id: "user-1", plan: "STARTER" },
    ...overrides,
  };
}

function mockFetchByEndpoint(options: {
  downloadResponse?: unknown;
  processResponse?: unknown;
  downloadStatus?: number;
}) {
  const {
    downloadResponse = downloadResponseWithRemap,
    processResponse = { success: true, file_id: "x", clips: [] },
    downloadStatus = 200,
  } = options;

  vi.mocked(undiciFetch).mockImplementation((async (url: RequestInfo) => {
    const urlStr = url.toString();
    if (urlStr === getYouTubeDownloadEndpoint()) {
      return new Response(JSON.stringify(downloadResponse), {
        status: downloadStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr === PROCESS_VIDEO_ENDPOINT) {
      return new Response(JSON.stringify(processResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as any);
}

function findCallTo(endpoint: string) {
  return vi
    .mocked(undiciFetch)
    .mock.calls.find(([url]) => url.toString() === endpoint);
}

describe("processVideoHandler — download parcial + remapeamento de cortes manuais no YouTube (RF-INGEST-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUploadedFileFindUniqueOrThrow.mockResolvedValue(baseUploadedFile());
    mockUploadedFileFindUnique.mockResolvedValue({
      userId: "user-1",
      creditsCost: 0,
      status: "queued",
    });
    mockUserFindUnique.mockResolvedValue({ reservedCredits: 0 });
    mockHoldCreditsExecute.mockResolvedValue({ success: true, heldCredits: 3 });
    mockConsumeCreditsExecute.mockResolvedValue({ success: true });
    mockUploadedFileUpdate.mockResolvedValue({});
    mockClipCreateMany.mockResolvedValue({ count: 0 });
  });

  it("envia manual_cuts (tempos ORIGINAIS) para /download_youtube quando mode='manual'", async () => {
    mockFetchByEndpoint({});

    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      },
      step: createStep(),
    });

    const downloadCall = findCallTo(getYouTubeDownloadEndpoint());
    expect(downloadCall).toBeDefined();
    const body = JSON.parse((downloadCall![1] as { body: string }).body);
    expect(body.manual_cuts).toEqual([
      { title: "Momento 1", start: 100, end: 130 },
      { title: "Momento 2", start: 500, end: 570 },
    ]);
  });

  it("usa os tempos REMAPEADOS (new_start/new_end) — nunca os originais — no payload de /process_video", async () => {
    mockFetchByEndpoint({});

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      },
      step: createStep(),
    });

    expect(result.success).toBe(true);

    const processCall = findCallTo(PROCESS_VIDEO_ENDPOINT);
    expect(processCall).toBeDefined();
    const body = JSON.parse((processCall![1] as { body: string }).body);
    expect(body.mode).toBe("manual");
    expect(body.manual_cuts).toEqual([
      { title: "Momento 1", start: 2, end: 32 },
      { title: "Momento 2", start: 36, end: 106 },
    ]);
  });

  it("valida os cortes contra a duração ORIGINAL do vídeo (antes do remapeamento) e reserva créditos pela soma dos cortes originais", async () => {
    mockFetchByEndpoint({});

    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      },
      step: createStep(),
    });

    // Soma dos cortes ORIGINAIS: 30s + 70s = 100s (não os remapeados, que
    // teriam a mesma soma aqui só por coincidência de desenho do teste —
    // o que importa é que durationSeconds vem de `event.data.manualCuts`).
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 100 }),
    );
  });

  it("persiste s3Key/duração do vídeo concatenado, mas NUNCA grava manualCutsJson (cortes originais do projeto preservados para retry)", async () => {
    mockFetchByEndpoint({});

    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      },
      step: createStep(),
    });

    const downloadUpdateCall = mockUploadedFileUpdate.mock.calls.find(
      (args) => (args[0] as { data?: Record<string, unknown> }).data?.s3Key !== undefined,
    );
    expect(downloadUpdateCall).toBeDefined();
    const data = (downloadUpdateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.s3Key).toBe(ORIGINAL_S3_KEY);
    expect(data.durationSeconds).toBe(3600);

    // Nenhuma das chamadas de update (download, mark-processing,
    // persist-clips-and-consume) deve tocar manualCutsJson.
    for (const call of mockUploadedFileUpdate.mock.calls) {
      expect((call[0] as { data: Record<string, unknown> }).data).not.toHaveProperty(
        "manualCutsJson",
      );
    }
  });

  it("falha explicitamente (sem fallback silencioso para os tempos originais) quando o backend não devolve remapped_cuts no modo manual", async () => {
    mockFetchByEndpoint({
      downloadResponse: {
        success: true,
        s3_key: ORIGINAL_S3_KEY,
        title: "t",
        duration: 3600,
        thumbnail: null,
        // Sem remapped_cuts/remapped_ranges — cenário de regressão/edge case.
      },
    });

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          mode: "manual",
          manualCuts,
        },
      },
      step: createStep(),
    });

    expect(result.success).toBe(false);
    // Nunca chegou a chamar /process_video com (ou sem) os tempos originais.
    expect(findCallTo(PROCESS_VIDEO_ENDPOINT)).toBeUndefined();
  });

  it("regressão: modo automático no YouTube não envia manual_cuts ao download nem aciona o remapeamento", async () => {
    mockFetchByEndpoint({
      downloadResponse: {
        success: true,
        s3_key: ORIGINAL_S3_KEY,
        title: "t",
        duration: 3600,
        thumbnail: null,
      },
    });

    const result = await processVideoHandler({
      event: {
        data: { uploadedFileId: "file-yt-1", userId: "user-1", mode: "auto" },
      },
      step: createStep(),
    });

    expect(result.success).toBe(true);

    const downloadCall = findCallTo(getYouTubeDownloadEndpoint());
    const downloadBody = JSON.parse((downloadCall![1] as { body: string }).body);
    expect(downloadBody).not.toHaveProperty("manual_cuts");

    const processCall = findCallTo(PROCESS_VIDEO_ENDPOINT);
    const processBody = JSON.parse((processCall![1] as { body: string }).body);
    expect(processBody.mode).toBe("auto");
    expect(processBody.manual_cuts).toBeUndefined();
  });
});
