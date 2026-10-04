import { describe, it, expect, beforeEach } from "vitest";
import { DeleteProjectUseCase } from "~/application/use-cases/delete-project.use-case";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryClipRepository } from "../../../mocks/in-memory-clip-repository";
import { InMemoryStorageGateway } from "../../../mocks/in-memory-storage-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("DeleteProjectUseCase", () => {
  let uploadedFileRepo: InMemoryUploadedFileRepository;
  let clipRepo: InMemoryClipRepository;
  let storageGateway: InMemoryStorageGateway;
  let useCase: DeleteProjectUseCase;

  beforeEach(() => {
    uploadedFileRepo = new InMemoryUploadedFileRepository();
    clipRepo = new InMemoryClipRepository();
    storageGateway = new InMemoryStorageGateway();
    useCase = new DeleteProjectUseCase(uploadedFileRepo, clipRepo, storageGateway);
  });

  it("deve deletar um projeto com sucesso quando o usuário é o dono", async () => {
    const userId: string = "user-123";
    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Meu vídeo",
      sourceType: "YOUTUBE",
    });

    await useCase.execute({ userId, projectId: file.id });

    // Verificar que o projeto foi deletado do banco
    const deletedFile = await uploadedFileRepo.findById(file.id);
    expect(deletedFile).toBeNull();

    // Verificar que o arquivo do S3 foi deletado
    expect(storageGateway.deletedKeys).toContain("uploads/video-1.mp4");
  });

  it("deve deletar todos os clipes do S3 quando o projeto é deletado", async () => {
    const userId: string = "user-123";
    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Meu vídeo",
      sourceType: "YOUTUBE",
    });

    // Criar clips associados
    await clipRepo.createMany([
      {
        userId,
        uploadedFileId: file.id,
        s3Key: "clips/clip-1.mp4",
        title: "Clip 1",
        startTime: 0,
        endTime: 10,
        durationSeconds: 10,
        transcriptWords: [],
      },
      {
        userId,
        uploadedFileId: file.id,
        s3Key: "clips/clip-2.mp4",
        title: "Clip 2",
        startTime: 15,
        endTime: 25,
        durationSeconds: 10,
        transcriptWords: [],
      },
    ]);

    await useCase.execute({ userId, projectId: file.id });

    // Verificar que todos os clipes foram deletados do S3
    expect(storageGateway.deletedKeys).toContain("clips/clip-1.mp4");
    expect(storageGateway.deletedKeys).toContain("clips/clip-2.mp4");
    expect(storageGateway.deletedKeys).toContain("uploads/video-1.mp4");
  });

  it("deve lançar NotFoundError quando o projeto não existe", async () => {
    const userId: string = "user-123";
    const projectId: string = "proj-999";

    await expect(
      useCase.execute({ userId, projectId })
    ).rejects.toThrow(NotFoundError);
  });

  it("deve lançar UnauthorizedError quando o usuário não é o dono do projeto", async () => {
    const userId: string = "user-123";
    const otherUserId: string = "user-999";

    const file = await uploadedFileRepo.create({
      userId: otherUserId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Vídeo do outro usuário",
      sourceType: "YOUTUBE",
    });

    await expect(
      useCase.execute({ userId, projectId: file.id })
    ).rejects.toThrow(UnauthorizedError);

    // Verificar que o projeto NÃO foi deletado (segurança)
    const stillExists = await uploadedFileRepo.findById(file.id);
    expect(stillExists).not.toBeNull();
  });

  it("deve deletar o projeto mesmo quando ele não tem s3Key", async () => {
    const userId: string = "user-123";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "",
      displayName: "Vídeo sem arquivo",
      sourceType: "YOUTUBE",
    });

    await useCase.execute({ userId, projectId: file.id });

    // Verificar que o projeto foi deletado
    const deletedFile = await uploadedFileRepo.findById(file.id);
    expect(deletedFile).toBeNull();

    // Verificar que nenhum arquivo foi tentado deletar do S3
    expect(storageGateway.deletedKeys).toHaveLength(0);
  });

  it("deve ignorar clipes sem s3Key ao deletar", async () => {
    const userId: string = "user-123";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Meu vídeo",
      sourceType: "YOUTUBE",
    });

    // Criar clips, alguns com s3Key e outros sem
    await clipRepo.createMany([
      {
        userId,
        uploadedFileId: file.id,
        s3Key: "clips/clip-1.mp4",
        title: "Clip com arquivo",
        startTime: 0,
        endTime: 10,
        durationSeconds: 10,
        transcriptWords: [],
      },
      {
        userId,
        uploadedFileId: file.id,
        s3Key: "",
        title: "Clip sem arquivo",
        startTime: 15,
        endTime: 25,
        durationSeconds: 10,
        transcriptWords: [],
      },
    ]);

    await useCase.execute({ userId, projectId: file.id });

    // Verificar que apenas o clip com s3Key foi deletado
    expect(storageGateway.deletedKeys).toContain("clips/clip-1.mp4");
    expect(storageGateway.deletedKeys).not.toContain(null);
    expect(storageGateway.deletedKeys.length).toBe(2); // clip-1.mp4 e video-1.mp4
  });

  it("deve deletar um projeto que não tem clips associados", async () => {
    const userId: string = "user-123";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Vídeo sem clipes",
      sourceType: "YOUTUBE",
    });

    // Buscar clips (não deve haver nenhum)
    const clips = await clipRepo.findByUploadedFileId(file.id);
    expect(clips).toHaveLength(0);

    await useCase.execute({ userId, projectId: file.id });

    // Verificar que o projeto foi deletado
    const deletedFile = await uploadedFileRepo.findById(file.id);
    expect(deletedFile).toBeNull();

    // Verificar que apenas o arquivo do projeto foi deletado do S3
    expect(storageGateway.deletedKeys).toEqual(["uploads/video-1.mp4"]);
  });
});
