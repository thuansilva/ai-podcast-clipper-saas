import { describe, it, expect, vi, beforeEach } from "vitest";
import { importYouTubeVideo } from "~/actions/youtube";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";
import { revalidatePath } from "next/cache";

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((cb: any) => cb),
}));

vi.mock("~/application/services/processing-options.service", () => ({
  getProcessingOptions: vi.fn().mockResolvedValue({
    GENRE: [
      { value: "humor", label: "Humor" },
      { value: "podcast", label: "Podcast" },
    ],
    DURATION: [
      { value: "30-60", label: "30-60s" },
      { value: "60-90", label: "60-90s" },
    ],
    ASPECT_RATIO: [
      { value: "9:16", label: "9:16" },
      { value: "16:9", label: "16:9" },
    ],
    LAYOUT: [
      { value: "auto", label: "Auto" },
      { value: "split", label: "Split" },
    ],
  }),
}));

describe("importYouTubeVideo Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar erro se o usuário não estiver autenticado", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce(null);

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve retornar erro se a URL do YouTube for inválida", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await importYouTubeVideo({
      url: "https://vimeo.com/123456",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("não é um link válido");
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve criar UploadedFile com sourceType YOUTUBE, disparar evento no Inngest e revalidar", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    vi.mocked(db.uploadedFile.create).mockResolvedValueOnce({
      id: "uploaded-file-abc",
      userId: "user-123",
      s3Key: "youtube/123/original.mp4",
      displayName: "YouTube Video (dQw4w9WgXcQ)",
      sourceType: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationSeconds: 0,
      creditsCost: 0,
      uploaded: true,
      status: "queued",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(inngest.send).mockResolvedValueOnce({} as any);

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "HORMOZI",
    });

    expect(result).toEqual({
      success: true,
      uploadedFileId: "uploaded-file-abc",
    });

    expect(db.uploadedFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        sourceType: "YOUTUBE",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        displayName: "YouTube Video (dQw4w9WgXcQ)",
        uploaded: true,
        status: "queued",
        s3Key: expect.stringMatching(/^youtube\/[a-f0-9-]+\/original\.mp4$/),
      }),
    });

    expect(inngest.send).toHaveBeenCalledWith({
      name: "process-video-events",
      data: {
        uploadedFileId: "uploaded-file-abc",
        userId: "user-123",
        preset: "HORMOZI",
      },
    });

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("deve capturar e retornar exceções na criação ou envio de eventos", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    vi.mocked(db.uploadedFile.create).mockRejectedValueOnce(
      new Error("Database connection failure"),
    );

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result).toEqual({
      success: false,
      error: "Database connection failure",
    });
  });

  it("deve repassar mode e manualCuts para o Inngest quando fornecidos", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    vi.mocked(db.uploadedFile.create).mockResolvedValueOnce({
      id: "uploaded-file-xyz",
      userId: "user-123",
      s3Key: "youtube/123/original.mp4",
      displayName: "YouTube Video (dQw4w9WgXcQ)",
      sourceType: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationSeconds: 0,
      creditsCost: 0,
      uploaded: true,
      status: "queued",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(inngest.send).mockResolvedValueOnce({} as any);

    const manualCuts = [
      { id: "cut-1", title: "Corte Manual 1", startTime: 15, endTime: 45 },
    ];

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts,
    });

    expect(result).toEqual({
      success: true,
      uploadedFileId: "uploaded-file-xyz",
    });

    expect(inngest.send).toHaveBeenCalledWith({
      name: "process-video-events",
      data: {
        uploadedFileId: "uploaded-file-xyz",
        userId: "user-123",
        preset: "HORMOZI",
        mode: "manual",
        manualCuts,
      },
    });

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("deve retornar erro se o genre fornecido for inválido", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      genre: "invalid_genre",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid genre",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve retornar erro se o targetDuration fornecido for inválido", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetDuration: "invalid_duration",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid duration",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve retornar erro se o aspectRatio fornecido for inválido", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      aspectRatio: "4:3",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid aspect ratio",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve retornar erro se o layout fornecido for inválido", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      layout: "invalid_layout",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid layout",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve passar opções válidas e autoZoom para o useCase com sucesso", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    vi.mocked(db.uploadedFile.create).mockResolvedValueOnce({
      id: "uploaded-file-custom",
      userId: "user-123",
      s3Key: "youtube/123/original.mp4",
      displayName: "YouTube Video (dQw4w9WgXcQ)",
      sourceType: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationSeconds: 0,
      creditsCost: 0,
      uploaded: true,
      status: "queued",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(inngest.send).mockResolvedValueOnce({} as any);

    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      genre: "humor",
      targetDuration: "30-60",
      aspectRatio: "9:16",
      layout: "split",
      autoZoom: true,
    });

    expect(result).toEqual({
      success: true,
      uploadedFileId: "uploaded-file-custom",
    });
  });
});
