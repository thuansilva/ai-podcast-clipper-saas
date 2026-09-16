import { describe, it, expect, beforeEach } from "vitest";
import { ImportYouTubeVideoUseCase } from "~/application/use-cases/videos/import-youtube-video.use-case";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryQueueGateway } from "../../../mocks/in-memory-queue-gateway";
import { InvalidYouTubeUrlError } from "~/domain/errors/invalid-youtube-url-error";

describe("ImportYouTubeVideoUseCase", () => {
  let fileRepo: InMemoryUploadedFileRepository;
  let queueGateway: InMemoryQueueGateway;
  let useCase: ImportYouTubeVideoUseCase;

  beforeEach(() => {
    fileRepo = new InMemoryUploadedFileRepository();
    queueGateway = new InMemoryQueueGateway();
    useCase = new ImportYouTubeVideoUseCase(fileRepo, queueGateway);
  });

  it("deve validar link, criar registro e disparar evento para a fila", async () => {
    const result = await useCase.execute({
      userId: "user-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "HORMOZI",
    });

    expect(result.success).toBe(true);
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    expect(result.s3Key).toContain("youtube/");

    const file = await fileRepo.findById(result.uploadedFileId);
    expect(file?.sourceType).toBe("YOUTUBE");
    expect(file?.youtubeUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]?.uploadedFileId).toBe(result.uploadedFileId);
    expect(queueGateway.sentEvents[0]?.preset).toBe("HORMOZI");
  });

  it("deve lançar InvalidYouTubeUrlError para links inválidos", async () => {
    await expect(
      useCase.execute({
        userId: "user-1",
        url: "https://vimeo.com/12345",
      })
    ).rejects.toThrow(InvalidYouTubeUrlError);

    expect(queueGateway.sentEvents).toHaveLength(0);
  });

  it("deve repassar mode e manualCuts para a fila quando fornecidos", async () => {
    const manualCuts = [
      { id: "cut-1", title: "Corte 1", startTime: 10, endTime: 45 },
      { id: "cut-2", title: "Corte 2", startTime: 60, endTime: 95 },
    ];

    const result = await useCase.execute({
      userId: "user-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts,
    });

    expect(result.success).toBe(true);
    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]).toEqual({
      uploadedFileId: result.uploadedFileId,
      userId: "user-1",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts,
    });
  });

  it("deve persistir genre, targetDuration, aspectRatio, layout, autoZoom e preset no repositório", async () => {
    const result = await useCase.execute({
      userId: "user-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "NONE",
      genre: "humor",
      targetDuration: "less_than_30s",
      aspectRatio: "9:16",
      layout: "face_focus",
      autoZoom: false,
      sliceStartTime: 10,
      sliceEndTime: 120,
    });

    expect(result.success).toBe(true);

    const file = await fileRepo.findById(result.uploadedFileId);
    expect(file).toBeDefined();
    expect(file?.subtitlePreset).toBe("NONE");
    expect(file?.genre).toBe("humor");
    expect(file?.targetDuration).toBe("less_than_30s");
    expect(file?.aspectRatio).toBe("9:16");
    expect(file?.layout).toBe("face_focus");
    expect(file?.autoZoom).toBe(false);
    expect(file?.sliceStartTime).toBe(10);
    expect(file?.sliceEndTime).toBe(120);

    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]?.preset).toBe("NONE");
  });
});
