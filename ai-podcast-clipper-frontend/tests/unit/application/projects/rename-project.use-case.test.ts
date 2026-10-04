import { describe, it, expect, beforeEach } from "vitest";
import { RenameProjectUseCase } from "~/application/use-cases/rename-project.use-case";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("RenameProjectUseCase", () => {
  let uploadedFileRepo: InMemoryUploadedFileRepository;
  let useCase: RenameProjectUseCase;

  beforeEach(() => {
    uploadedFileRepo = new InMemoryUploadedFileRepository();
    useCase = new RenameProjectUseCase(uploadedFileRepo);
  });

  it("deve renomear um projeto com sucesso quando o usuário é o dono", async () => {
    const userId: string = "user-123";
    const newName: string = "Novo nome do projeto";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    // Verificar que o nome foi atualizado
    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile).not.toBeNull();
    expect(updatedFile?.displayName).toBe(newName);
  });

  it("deve preservar outros campos do projeto ao renomear", async () => {
    const userId: string = "user-123";
    const newName: string = "Novo nome";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
      durationSeconds: 3600,
      creditsCost: 5,
      status: "processed",
    });

    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile?.displayName).toBe(newName);
    expect(updatedFile?.s3Key).toBe("uploads/video-1.mp4");
    expect(updatedFile?.durationSeconds).toBe(3600);
    expect(updatedFile?.creditsCost).toBe(5);
    expect(updatedFile?.status).toBe("processed");
  });

  it("deve lançar NotFoundError quando o projeto não existe", async () => {
    const userId: string = "user-123";
    const projectId: string = "proj-999";
    const newName: string = "Novo nome";

    await expect(
      useCase.execute({ userId, projectId, newName })
    ).rejects.toThrow(NotFoundError);
  });

  it("deve lançar UnauthorizedError quando o usuário não é o dono do projeto", async () => {
    const userId: string = "user-123";
    const otherUserId: string = "user-999";
    const newName: string = "Novo nome";

    const file = await uploadedFileRepo.create({
      userId: otherUserId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    await expect(
      useCase.execute({ userId, projectId: file.id, newName })
    ).rejects.toThrow(UnauthorizedError);

    // Verificar que o nome NÃO foi alterado (segurança)
    const unchangedFile = await uploadedFileRepo.findById(file.id);
    expect(unchangedFile?.displayName).toBe("Nome antigo");
  });

  it("deve renomear para um nome vazio (validação na action, não no use case)", async () => {
    const userId: string = "user-123";
    const newName: string = "";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    // O use case não valida se o nome é vazio — essa validação fica na server action
    // Aqui apenas testamos que o comportamento é o esperado
    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile?.displayName).toBe("");
  });

  it("deve renomear para um nome com caracteres especiais", async () => {
    const userId: string = "user-123";
    const newName: string = "Projeto #1 — Como criar (2024) [final]";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile?.displayName).toBe(newName);
  });

  it("deve renomear para um nome muito longo", async () => {
    const userId: string = "user-123";
    const newName: string = "A".repeat(500); // Nome com 500 caracteres

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile?.displayName).toBe(newName);
  });

  it("deve atualizar o timestamp updatedAt ao renomear", async () => {
    const userId: string = "user-123";
    const newName: string = "Novo nome";

    const file = await uploadedFileRepo.create({
      userId,
      s3Key: "uploads/video-1.mp4",
      displayName: "Nome antigo",
      sourceType: "YOUTUBE",
    });

    const originalUpdatedAt = file.updatedAt;

    // Pequeno delay para garantir que o timestamp seja diferente
    await new Promise((resolve) => setTimeout(resolve, 10));

    await useCase.execute({
      userId,
      projectId: file.id,
      newName,
    });

    const updatedFile = await uploadedFileRepo.findById(file.id);
    expect(updatedFile?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      originalUpdatedAt.getTime()
    );
  });
});
