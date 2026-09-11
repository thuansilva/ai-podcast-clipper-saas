import { describe, it, expect, beforeEach } from "vitest";
import { GetClipPlayUrlUseCase } from "~/application/use-cases/clips/get-clip-play-url.use-case";
import { InMemoryClipRepository } from "../../../mocks/in-memory-clip-repository";
import { InMemoryStorageGateway } from "../../../mocks/in-memory-storage-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("GetClipPlayUrlUseCase", () => {
  let clipRepo: InMemoryClipRepository;
  let storageGateway: InMemoryStorageGateway;
  let useCase: GetClipPlayUrlUseCase;

  beforeEach(() => {
    clipRepo = new InMemoryClipRepository();
    storageGateway = new InMemoryStorageGateway();
    useCase = new GetClipPlayUrlUseCase(clipRepo, storageGateway);
  });

  it("deve gerar URL de reprodução com sucesso quando o usuário for o dono do clipe", async () => {
    await clipRepo.createMany([
      {
        userId: "user-1",
        s3Key: "clips/user-1/clip_0.mp4",
        title: "Clipe Viral",
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
    expect(result.url).toContain("play=true");
  });

  it("deve lançar UnauthorizedError se o clipe pertencer a outro usuário", async () => {
    await clipRepo.createMany([
      {
        userId: "user-owner",
        s3Key: "clips/user-owner/clip_0.mp4",
        title: "Clipe Privado",
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
