/**
 * Bugfix 2026-10-14: o passo `persist-clips-and-consume` do fluxo normal
 * (`processVideoHandler`) não gravava `Clip.sourceStartTime`/`sourceEndTime`.
 * Todo projeto do YouTube com cortes manuais criado depois da migration
 * `20261014015607` caía em `LegacyClipsMissingSourceRangeError` ao tentar
 * "Adicionar cortes". Esta suíte garante o tempo no vídeo ORIGINAL em cada
 * caminho do fluxo normal.
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

function persistedClips() {
  expect(mockClipCreateMany).toHaveBeenCalledTimes(1);
  return (mockClipCreateMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data;
}

describe("processVideoHandler — persiste o tempo no vídeo ORIGINAL dos clipes", () => {
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
    mockClipCreateMany.mockResolvedValue({ count: 2 });
  });

  it("YouTube + cortes manuais: casa cada clipe com remapped_cuts e grava original_start/original_end", async () => {
    mockFetchByEndpoint({
      processResponse: {
        success: true,
        file_id: "x",
        clips: [
          { s3_key: "clips/a.mp4", title: "Momento 1", start: 2, end: 32, duration: 30 },
          { s3_key: "clips/b.mp4", title: "Momento 2", start: 36, end: 106, duration: 70 },
        ],
      },
    });

    await processVideoHandler({
      event: {
        data: { uploadedFileId: "file-yt-1", userId: "user-1", preset: "HORMOZI", mode: "manual", manualCuts },
      },
      step: createStep(),
    });

    const data = persistedClips();
    expect(data[0]).toMatchObject({ startTime: 2, endTime: 32, sourceStartTime: 100, sourceEndTime: 130 });
    expect(data[1]).toMatchObject({ startTime: 36, endTime: 106, sourceStartTime: 500, sourceEndTime: 570 });
  });

  it("YouTube + cortes manuais: clipe sem correspondência em remapped_cuts fica com source null (nunca inventa)", async () => {
    mockFetchByEndpoint({
      processResponse: {
        success: true,
        file_id: "x",
        clips: [{ s3_key: "clips/a.mp4", title: "?", start: 50, end: 80, duration: 30 }],
      },
    });

    await processVideoHandler({
      event: {
        data: { uploadedFileId: "file-yt-1", userId: "user-1", preset: "HORMOZI", mode: "manual", manualCuts },
      },
      step: createStep(),
    });

    expect(persistedClips()[0]).toMatchObject({ sourceStartTime: null, sourceEndTime: null });
  });

  it("YouTube automático (vídeo inteiro baixado): source = start/end", async () => {
    mockFetchByEndpoint({
      downloadResponse: { success: true, s3_key: ORIGINAL_S3_KEY, title: "Podcast", duration: 3600, thumbnail: null },
      processResponse: {
        success: true,
        file_id: "x",
        clips: [{ s3_key: "clips/a.mp4", title: "IA", start: 161, end: 221, duration: 60, virality_score: 80 }],
      },
    });

    await processVideoHandler({
      event: { data: { uploadedFileId: "file-yt-1", userId: "user-1", preset: "HORMOZI", mode: "auto" } },
      step: createStep(),
    });

    expect(persistedClips()[0]).toMatchObject({ startTime: 161, sourceStartTime: 161, sourceEndTime: 221 });
  });

  it("upload direto com cortes manuais (sem download/remapeamento): source = start/end", async () => {
    mockUploadedFileFindUniqueOrThrow.mockResolvedValue(
      baseUploadedFile({ sourceType: "UPLOAD", youtubeUrl: null, durationSeconds: 3600 }),
    );
    mockFetchByEndpoint({
      processResponse: {
        success: true,
        file_id: "x",
        clips: [{ s3_key: "clips/a.mp4", title: "Momento 1", start: 100, end: 130, duration: 30 }],
      },
    });

    await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-yt-1",
          userId: "user-1",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts: [manualCuts[0]!],
        },
      },
      step: createStep(),
    });

    expect(persistedClips()[0]).toMatchObject({ sourceStartTime: 100, sourceEndTime: 130 });
  });
});
