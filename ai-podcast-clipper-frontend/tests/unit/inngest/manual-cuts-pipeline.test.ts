import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processVideoHandler, type PipelineStep } from "~/inngest/functions";
import { env } from "~/env";

// Mock env
vi.mock("~/env", () => ({
  env: {
    PROCESS_VIDEO_ENDPOINT: "https://modal.run/process-video",
    PROCESS_VIDEO_ENDPOINT_AUTH: "mock-token",
    S3_BUCKET_NAME: "mock-bucket",
  },
}));

// Mock DB
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

// Mock Use Cases
const mockHoldCreditsExecute = vi.fn();
const mockConsumeCreditsExecute = vi.fn();
const mockRefundCreditsExecute = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeHoldCreditsUseCase: () => ({
    execute: mockHoldCreditsExecute,
  }),
  makeConsumeCreditsUseCase: () => ({
    execute: mockConsumeCreditsExecute,
  }),
  makeRefundCreditsUseCase: () => ({
    execute: mockRefundCreditsExecute,
  }),
}));

describe("Inngest Manual Cuts Pipeline (Unit)", () => {
  const createMockStep = (): PipelineStep => ({
    run: vi.fn(
      async (_name: string, fn: () => unknown) => await fn(),
    ) as unknown as PipelineStep["run"],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUploadedFileFindUniqueOrThrow.mockResolvedValue({
      id: "file-123",
      userId: "user-456",
      s3Key: "uploads/file-123/video.mp4",
      durationSeconds: 600, // 10 minutos (custaria 10 créditos no modo auto)
      sourceType: "UPLOAD",
      status: "queued",
      displayName: "podcast.mp4",
      user: {
        id: "user-456",
        plan: "STARTER",
      },
    });

    mockHoldCreditsExecute.mockResolvedValue({
      success: true,
      heldCredits: 3,
    });

    mockConsumeCreditsExecute.mockResolvedValue({
      success: true,
    });

    mockUploadedFileUpdate.mockResolvedValue({});
    mockClipCreateMany.mockResolvedValue({ count: 2 });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url.toString() === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: "uploads/file-123/video.mp4",
            clips: [
              {
                title: "Destaque 1",
                s3_key: "uploads/file-123/clip1.mp4",
                start: 10,
                end: 40,
                duration: 30,
              },
              {
                title: "Destaque 2",
                s3_key: "uploads/file-123/clip2.mp4",
                start: 100,
                end: 170,
                duration: 70,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deve reservar créditos proporcionais aos cortes manuais e despachar payload formatado para o Modal", async () => {
    const mockStep = createMockStep();
    const manualCuts = [
      { title: "Momento 1", startTime: 10, endTime: 40 }, // 30s -> 1 crédito
      { title: "Momento 2", startTime: 100, endTime: 170 }, // 70s -> 2 créditos (total 3 créditos)
    ];

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          userId: "user-456",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    // 1. Verifica reserva de créditos com valor proporcional aos cortes manuais (3 créditos em vez de 10)
    expect(mockHoldCreditsExecute).toHaveBeenCalledTimes(1);
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      durationSeconds: 600,
      fileId: "file-123",
      amount: 3,
    });

    // 2. Verifica payload despachado para o Modal GPU
    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, requestInit] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe(env.PROCESS_VIDEO_ENDPOINT);

    const parsedBody = JSON.parse(requestInit?.body as string);
    expect(parsedBody).toEqual({
      s3_key: "uploads/file-123/video.mp4",
      preset: "HORMOZI",
      mode: "manual",
      manual_cuts: [
        { title: "Momento 1", start: 10, end: 40 },
        { title: "Momento 2", start: 100, end: 170 },
      ],
    });

    // 3. Verifica consumo dos créditos proporcionais
    expect(mockConsumeCreditsExecute).toHaveBeenCalledTimes(1);
    expect(mockConsumeCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      amount: 3,
      heldAmount: 3,
      fileId: "file-123",
    });

    // 4. Verifica persistência dos clipes e finalização
    expect(mockClipCreateMany).toHaveBeenCalledTimes(1);
    expect(mockUploadedFileUpdate).toHaveBeenCalledWith({
      where: { id: "file-123" },
      data: { status: "processed" },
    });
  });

  it("deve usar modo auto e não passar amount quando mode for auto ou omitido", async () => {
    const mockStep = createMockStep();

    mockHoldCreditsExecute.mockResolvedValue({
      success: true,
      heldCredits: 10, // 600s -> 10 créditos
    });

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          userId: "user-456",
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    // HoldCredits chamado sem amount (ou amount undefined), delegando para durationSeconds
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      durationSeconds: 600,
      fileId: "file-123",
      amount: undefined,
    });

    const fetchSpy = vi.mocked(globalThis.fetch);
    const [, requestInit] = fetchSpy.mock.calls[0]!;
    const parsedBody = JSON.parse(requestInit?.body as string);

    expect(parsedBody.mode).toBe("auto");
    expect(parsedBody.manual_cuts).toBeUndefined();
  });

  it("deve fazer fallback para cálculo normal se mode for manual mas a lista de cortes estiver vazia", async () => {
    const mockStep = createMockStep();

    mockHoldCreditsExecute.mockResolvedValue({
      success: true,
      heldCredits: 10,
    });

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-123",
          userId: "user-456",
          mode: "manual",
          manualCuts: [],
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    // Como manualCuts está vazio, isManual deve ser falso e amount não deve ser calculado pelos cortes
    expect(mockHoldCreditsExecute).toHaveBeenCalledWith({
      userId: "user-456",
      durationSeconds: 600,
      fileId: "file-123",
      amount: undefined,
    });

    const fetchSpy = vi.mocked(globalThis.fetch);
    const [, requestInit] = fetchSpy.mock.calls[0]!;
    const parsedBody = JSON.parse(requestInit?.body as string);

    expect(parsedBody.mode).toBe("manual");
    expect(parsedBody.manual_cuts).toEqual([]);
  });

  it("deve abortar e marcar como failed quando a duração exceder o limite do plano STARTER (> 2h)", async () => {
    const mockStep = createMockStep();

    mockUploadedFileFindUniqueOrThrow.mockResolvedValue({
      id: "file-long",
      userId: "user-456",
      s3Key: "uploads/file-long/video.mp4",
      durationSeconds: 7500, // > 7200s (2h)
      sourceType: "UPLOAD",
      status: "queued",
      displayName: "long_podcast.mp4",
      user: {
        id: "user-456",
        plan: "STARTER",
      },
    });

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: "file-long",
          userId: "user-456",
          mode: "auto",
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("excede o limite de 2h");
    expect(mockHoldCreditsExecute).not.toHaveBeenCalled();
    expect(mockUploadedFileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file-long" },
        data: expect.objectContaining({
          status: "failed",
        }),
      })
    );
  });
});
