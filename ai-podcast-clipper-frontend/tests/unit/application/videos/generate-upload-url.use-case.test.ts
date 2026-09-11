import { describe, it, expect, beforeEach } from "vitest";
import { GenerateUploadUrlUseCase } from "~/application/use-cases/videos/generate-upload-url.use-case";
import { InMemoryStorageGateway } from "../../../mocks/in-memory-storage-gateway";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";

describe("GenerateUploadUrlUseCase", () => {
  let storageGateway: InMemoryStorageGateway;
  let fileRepo: InMemoryUploadedFileRepository;
  let useCase: GenerateUploadUrlUseCase;

  beforeEach(() => {
    storageGateway = new InMemoryStorageGateway();
    fileRepo = new InMemoryUploadedFileRepository();
    useCase = new GenerateUploadUrlUseCase(storageGateway, fileRepo);
  });

  it("deve criar registro de UploadedFile e retornar presigned PUT URL", async () => {
    const result = await useCase.execute({
      userId: "user-1",
      filename: "podcast_ep1.mp4",
      contentType: "video/mp4",
    });

    expect(result.success).toBe(true);
    expect(result.signedUrl).toContain("upload=true");
    expect(result.s3Key).toContain("uploads/user-1/");

    const file = await fileRepo.findById(result.uploadedFileId);
    expect(file).not.toBeNull();
    expect(file?.userId).toBe("user-1");
    expect(file?.sourceType).toBe("UPLOAD");
    expect(file?.status).toBe("queued");
  });
});
