import { describe, it, expect, beforeEach } from "vitest";
import { UpdateClipUseCase } from "~/application/use-cases/clips/update-clip.use-case";
import { InMemoryClipRepository } from "../../../mocks/in-memory-clip-repository";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("UpdateClipUseCase", () => {
  let clipRepo: InMemoryClipRepository;
  let useCase: UpdateClipUseCase;

  beforeEach(() => {
    clipRepo = new InMemoryClipRepository();
    useCase = new UpdateClipUseCase(clipRepo);
  });

  it("deve atualizar título e preset do clipe se o usuário for o dono", async () => {
    await clipRepo.createMany([
      {
        userId: "user-1",
        s3Key: "clips/user-1/clip_0.mp4",
        title: "Título Antigo",
        startTime: 0,
        endTime: 35,
        durationSeconds: 35,
        subtitlePreset: "HORMOZI",
      },
    ]);

    const clips = await clipRepo.findByUserId("user-1");
    const clipId = clips[0]!.id;

    const result = await useCase.execute({
      clipId,
      userId: "user-1",
      title: "Título Novo e Chamativo",
      subtitlePreset: "NEON",
    });

    expect(result.success).toBe(true);

    const updated = await clipRepo.findById(clipId);
    expect(updated?.title).toBe("Título Novo e Chamativo");
    expect(updated?.subtitlePreset).toBe("NEON");
  });

  it("deve lançar UnauthorizedError se tentar atualizar clipe de outro usuário", async () => {
    await clipRepo.createMany([
      {
        userId: "user-1",
        s3Key: "clips/user-1/clip_0.mp4",
        title: "Título Original",
        startTime: 0,
        endTime: 35,
        durationSeconds: 35,
      },
    ]);

    const clips = await clipRepo.findByUserId("user-1");
    const clipId = clips[0]!.id;

    await expect(
      useCase.execute({
        clipId,
        userId: "user-2",
        title: "Tentativa de Hack",
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("deve lançar NotFoundError se o clipe não existir", async () => {
    await expect(
      useCase.execute({
        clipId: "non-existent",
        userId: "user-1",
        title: "Teste",
      })
    ).rejects.toThrow(NotFoundError);
  });
});
