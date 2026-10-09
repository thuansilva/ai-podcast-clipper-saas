/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { db } from "~/server/db";
import {
  makeDeleteProjectUseCase,
  makeRenameProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

describe("Project Use Cases Integration Tests", () => {
  useRollbackTransactionPerTest();

  async function createTestUser() {
    const user = await db.user.create({
      data: {
        id: `user_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        reservedCredits: 0,
      },
    });
    return user;
  }

  async function createTestFile(userId: string) {
    const file = await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`,
        displayName: "Test Video",
        status: "completed",
        sourceType: "YOUTUBE",
      },
    });
    return file;
  }


  describe("DeleteProjectUseCase Integration", () => {
    it("deve deletar um projeto com sucesso no banco de dados", async () => {
      const user = await createTestUser();
      const file = await createTestFile(user.id);

      const useCase = makeDeleteProjectUseCase();
      await useCase.execute({ userId: user.id, projectId: file.id });

      // Verificar que o projeto foi deletado do banco
      const deletedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(deletedFile).toBeNull();
    });

    it("deve deletar todos os clips associados ao projeto", async () => {
      const user = await createTestUser();
      const file = await createTestFile(user.id);

      // Criar clips associados ao arquivo
      await db.clip.createMany({
        data: [
          {
            userId: user.id,
            uploadedFileId: file.id,
            s3Key: `clips/test-${Date.now()}-1.mp4`,
            title: "Clip 1",
            startTime: 0,
            endTime: 10,
            durationSeconds: 10,
            transcriptWords: [],
          },
          {
            userId: user.id,
            uploadedFileId: file.id,
            s3Key: `clips/test-${Date.now()}-2.mp4`,
            title: "Clip 2",
            startTime: 15,
            endTime: 25,
            durationSeconds: 10,
            transcriptWords: [],
          },
        ],
      });

      const clipsBeforeDelete = await db.clip.findMany({
        where: { uploadedFileId: file.id },
      });
      expect(clipsBeforeDelete).toHaveLength(2);

      const useCase = makeDeleteProjectUseCase();
      await useCase.execute({ userId: user.id, projectId: file.id });

      // Verificar que o projeto foi deletado
      const deletedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(deletedFile).toBeNull();

      // Verificar que todos os clips foram deletados (cascata)
      const clipsAfterDelete = await db.clip.findMany({
        where: { uploadedFileId: file.id },
      });
      expect(clipsAfterDelete).toHaveLength(0);
    });

    it("deve lançar NotFoundError quando o projeto não existe", async () => {
      const user = await createTestUser();
      const useCase = makeDeleteProjectUseCase();

      await expect(
        useCase.execute({ userId: user.id, projectId: "proj-non-existent" })
      ).rejects.toThrow(NotFoundError);
    });

    it("deve lançar UnauthorizedError quando o usuário não é o dono do projeto", async () => {
      const owner = await createTestUser();
      const otherUser = await createTestUser();
      const file = await createTestFile(owner.id);

      const useCase = makeDeleteProjectUseCase();

      await expect(
        useCase.execute({ userId: otherUser.id, projectId: file.id })
      ).rejects.toThrow(UnauthorizedError);

      // Verificar que o projeto ainda existe (não foi deletado)
      const stillExists = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });

  describe("RenameProjectUseCase Integration", () => {
    it("deve renomear um projeto com sucesso no banco de dados", async () => {
      const user = await createTestUser();
      const file = await createTestFile(user.id);
      const newName = "Projeto Renomeado";

      const useCase = makeRenameProjectUseCase();
      await useCase.execute({
        userId: user.id,
        projectId: file.id,
        newName,
      });

      // Verificar que o nome foi atualizado no banco
      const updatedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(updatedFile?.displayName).toBe(newName);
    });

    it("deve preservar outros campos do projeto ao renomear", async () => {
      const user = await createTestUser();

      const file = await db.uploadedFile.create({
        data: {
          userId: user.id,
          s3Key: `uploads/test-${Date.now()}.mp4`,
          displayName: "Nome antigo",
          status: "completed",
          sourceType: "YOUTUBE",
          durationSeconds: 3600,
          creditsCost: 10,
        },
      });

      const newName = "Novo Nome";
      const useCase = makeRenameProjectUseCase();
      await useCase.execute({
        userId: user.id,
        projectId: file.id,
        newName,
      });

      const updatedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });

      // Verificar que apenas o displayName foi alterado
      expect(updatedFile?.displayName).toBe(newName);
      expect(updatedFile?.s3Key).toBe(file.s3Key);
      expect(updatedFile?.durationSeconds).toBe(3600);
      expect(updatedFile?.creditsCost).toBe(10);
      expect(updatedFile?.status).toBe("completed");
      expect(updatedFile?.sourceType).toBe("YOUTUBE");
    });

    it("deve lançar NotFoundError quando o projeto não existe", async () => {
      const user = await createTestUser();
      const useCase = makeRenameProjectUseCase();

      await expect(
        useCase.execute({
          userId: user.id,
          projectId: "proj-non-existent",
          newName: "Novo Nome",
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("deve lançar UnauthorizedError quando o usuário não é o dono do projeto", async () => {
      const owner = await createTestUser();
      const otherUser = await createTestUser();
      const file = await createTestFile(owner.id);

      const useCase = makeRenameProjectUseCase();

      await expect(
        useCase.execute({
          userId: otherUser.id,
          projectId: file.id,
          newName: "Novo Nome",
        })
      ).rejects.toThrow(UnauthorizedError);

      // Verificar que o nome não foi alterado (segurança)
      const unchangedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(unchangedFile?.displayName).toBe("Test Video");
    });

    it("deve renomear para um nome com caracteres especiais", async () => {
      const user = await createTestUser();
      const file = await createTestFile(user.id);
      const newName = "Projeto #1 — Como criar (2024) [final] 🎬";

      const useCase = makeRenameProjectUseCase();
      await useCase.execute({
        userId: user.id,
        projectId: file.id,
        newName,
      });

      const updatedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(updatedFile?.displayName).toBe(newName);
    });

    it("deve atualizar o timestamp updatedAt ao renomear", async () => {
      const user = await createTestUser();
      const file = await createTestFile(user.id);
      const originalUpdatedAt = file.updatedAt;

      // Pequeno delay para garantir que o timestamp seja diferente
      await new Promise((resolve) => setTimeout(resolve, 10));

      const useCase = makeRenameProjectUseCase();
      await useCase.execute({
        userId: user.id,
        projectId: file.id,
        newName: "Novo Nome",
      });

      const updatedFile = await db.uploadedFile.findUnique({
        where: { id: file.id },
      });
      expect(updatedFile?.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );
    });

    it("deve permitir renomear múltiplos projetos do mesmo usuário", async () => {
      const user = await createTestUser();
      const file1 = await createTestFile(user.id);
      const file2 = await createTestFile(user.id);

      const useCase = makeRenameProjectUseCase();

      await useCase.execute({
        userId: user.id,
        projectId: file1.id,
        newName: "Projeto Um",
      });

      await useCase.execute({
        userId: user.id,
        projectId: file2.id,
        newName: "Projeto Dois",
      });

      const updated1 = await db.uploadedFile.findUnique({
        where: { id: file1.id },
      });
      const updated2 = await db.uploadedFile.findUnique({
        where: { id: file2.id },
      });

      expect(updated1?.displayName).toBe("Projeto Um");
      expect(updated2?.displayName).toBe("Projeto Dois");
    });
  });
});
