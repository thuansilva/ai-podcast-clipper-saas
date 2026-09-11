import { describe, it, expect, vi, beforeEach } from "vitest";
import { importYouTubeVideo } from "~/actions/youtube";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";
import { revalidatePath } from "next/cache";

vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      create: vi.fn(),
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
}));

describe("importYouTubeVideo Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar erro se o usuário não estiver autenticado", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as any);

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
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "user-123" },
      expires: "2099-01-01",
    } as any);

    const result = await importYouTubeVideo({
      url: "https://vimeo.com/123456",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid YouTube URL",
    });
    expect(db.uploadedFile.create).not.toHaveBeenCalled();
  });

  it("deve criar UploadedFile com sourceType YOUTUBE, disparar evento no Inngest e revalidar", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "user-123" },
      expires: "2099-01-01",
    } as any);

    vi.mocked(db.uploadedFile.create).mockResolvedValueOnce({
      id: "uploaded-file-abc",
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
      select: {
        id: true,
      },
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
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "user-123" },
      expires: "2099-01-01",
    } as any);

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
});
