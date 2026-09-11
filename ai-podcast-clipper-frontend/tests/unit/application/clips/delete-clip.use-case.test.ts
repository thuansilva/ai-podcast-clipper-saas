import { describe, it, expect, beforeEach } from "vitest";
import { DeleteClipUseCase } from "~/application/use-cases/clips/delete-clip.use-case";
import { InMemoryClipRepository } from "../../../mocks/in-memory-clip-repository";
import { InMemoryStorageGateway } from "../../../mocks/in-memory-storage-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("DeleteClipUseCase", () => {
  let clipRepo: InMemoryClipRepository;
  let storageGateway: InMemoryStorageGateway;
  let useCase: DeleteClipUseCase;

  beforeEach(() => {
    clipRepo = new InMemoryClipRepository();
    storageGateway = new InMemoryStorageGateway();
    useCase = new DeleteClipUseCase(clipRepo, storageGateway);
  });

  it("deve deletar o clipe do banco de dados e do bucket S3", async () => {
    await clipRepo.createMany([
      {
        userId: "user-1",
        s3Key: "clips/user-1/clip_0.mp4",
        title: "Clipe para Deletar",
        startTime: 0,
        endTime: 35,
        durationSeconds: 35,
      },
    ]);

    const clips = await clipRepo.findByUserId("user-1");
    const clipId = clips[0]!.id;

    const result = await useCase.execute({
      clipId,
      userId: "user-1",
    });

    expect(result.success).toBe(true);

    const checkClip = await clipRepo.findById(clipId);
    expect(checkClip).toBeNull();

    expect(storageGateway.deletedKeys).toContain("clips/user-1/clip_0.mp4");
  });

  it("deve lançar UnauthorizedError se tentar deletar clipe de outro usuário", async () => {
    await clipRepo.createMany([
      {
        userId: "user-owner",
        s3Key: "clips/user-owner/clip_0.mp4",
        title: "Clipe",
        startTime: 0,
        endTime: 35,
        durationSeconds: 35,
      },
    ]);

    const clips = await clipRepo.findByUserId("user-owner");
    const clipId = clips[0]!.id;

    await expect(
      useCase.execute({
        clipId,
        userId: "user-attacker",
      })
    ).rejects.toThrow(UnauthorizedError);

    expect(storageGateway.deletedKeys).toHaveLength(0);
  });

  it("deve lançar NotFoundError se o clipe não existir", async () => {
    await expect(
      useCase.execute({
        clipId: "non-existent",
        userId: "user-1",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
