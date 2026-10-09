/**
 * @vitest-environment node
 *
 * Testes de integração: exercitam as Server Actions reais
 * (`~/actions/projects-actions`), passando pelos schemas reais de borda
 * (`projects-actions.schema.ts`), pelos use cases reais e pelos repositórios
 * reais (Prisma, banco de testes via docker-compose). Apenas autenticação
 * (Clerk) e a fila (Inngest) são mockadas — ambas dependem de infraestrutura
 * externa que não deve ser exercitada em teste.
 *
 * Objetivo principal: comprovar que um payload malicioso enviado "de fora"
 * (ex: via curl direto na Server Action, ignorando qualquer checagem de UI)
 * é rejeitado ANTES de qualquer escrita no banco.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../../helpers/with-rollback-transaction";

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

const mockInngestSend = vi.fn();
vi.mock("~/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

describe("projects-actions - Integração (schema real + use cases reais + Prisma real)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_projects_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Opções administráveis (ProcessingOption) que este teste precisa existir para
  // validar clipModel/aspectRatio. Criadas em cada teste dentro da transação
  // de rollback (não vêm do seed).
  const testProcessingOptions: Prisma.ProcessingOptionCreateInput[] = [
    { type: "CLIP_MODEL", value: "face_focus", label: "Foco no Rosto (teste)" },
    { type: "ASPECT_RATIO", value: "1:1", label: "1:1 (teste)" },
  ];

  beforeEach(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `projects-it-${Date.now()}@example.com`,
        password: "hashedpassword123",
        credits: 50,
      },
    });

    for (const option of testProcessingOptions) {
      await db.processingOption.create({ data: option });
    }
  });

  afterEach(() => {
    mockGetUserId.mockReset();
    mockInngestSend.mockReset();
  });

  async function createTestProject(overrides: Record<string, unknown> = {}) {
    return db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`,
        displayName: "Projeto de teste",
        status: "failed",
        ...overrides,
      },
    });
  }

  describe("renameProjectAction", () => {
    it("rejeita newName vazio (payload malicioso) sem alterar o registro no banco", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({ displayName: "Nome original" });

      const { renameProjectAction } = await import("~/actions/projects-actions");
      const result = await renameProjectAction(project.id, "   ");

      expect(result.success).toBe(false);

      const unchanged = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(unchanged?.displayName).toBe("Nome original");
    });

    it("rejeita newName acima de 200 caracteres sem alterar o registro no banco", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({ displayName: "Nome original" });

      const { renameProjectAction } = await import("~/actions/projects-actions");
      const result = await renameProjectAction(project.id, "a".repeat(201));

      expect(result.success).toBe(false);

      const unchanged = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(unchanged?.displayName).toBe("Nome original");
    });

    it("renomeia de fato o registro no banco quando o nome é válido", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({ displayName: "Nome original" });

      const { renameProjectAction } = await import("~/actions/projects-actions");
      const result = await renameProjectAction(project.id, "Nome renovado");

      expect(result).toEqual({ success: true });

      const updated = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(updated?.displayName).toBe("Nome renovado");
    });
  });

  describe("deleteProjectAction", () => {
    it("rejeita id vazio sem tocar no banco", async () => {
      mockGetUserId.mockResolvedValue(userId);

      const { deleteProjectAction } = await import("~/actions/projects-actions");
      const result = await deleteProjectAction("");

      expect(result.success).toBe(false);
    });

    it("rejeita id de outro usuário sem excluir o registro (regra de negócio, não só schema)", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const otherUserId = `user_projects_it_other_${Date.now()}`;
      await db.user.create({
        data: {
          id: otherUserId,
          email: `other-${Date.now()}@example.com`,
          password: "hashedpassword123",
        },
      });
      const otherProject = await db.uploadedFile.create({
        data: {
          userId: otherUserId,
          s3Key: `uploads/it-other-${Date.now()}.mp4`,
          status: "failed",
        },
      });

      const { deleteProjectAction } = await import("~/actions/projects-actions");
      const result = await deleteProjectAction(otherProject.id);

      expect(result.success).toBe(false);

      const stillThere = await db.uploadedFile.findUnique({
        where: { id: otherProject.id },
      });
      expect(stillThere).not.toBeNull();
    });
  });

  describe("retryProjectAction", () => {
    it("rejeita subtitlePreset malicioso sem alterar o registro no banco", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({
        status: "failed",
        errorMessage: "erro anterior",
      });

      const { retryProjectAction } = await import("~/actions/projects-actions");
      const result = await retryProjectAction(project.id, {
        subtitlePreset: "<script>alert(1)</script>",
      });

      expect(result.success).toBe(false);

      const unchanged = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(unchanged?.status).toBe("failed");
      expect(unchanged?.errorMessage).toBe("erro anterior");
      expect(mockInngestSend).not.toHaveBeenCalled();
    });

    it("rejeita clipModel que não existe nas ProcessingOptions reais do banco sem alterar o registro", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({
        status: "failed",
        errorMessage: "erro anterior",
      });

      const { retryProjectAction } = await import("~/actions/projects-actions");
      const result = await retryProjectAction(project.id, {
        clipModel: "modelo_que_nao_existe",
      });

      expect(result.success).toBe(false);

      const unchanged = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(unchanged?.status).toBe("failed");
      expect(mockInngestSend).not.toHaveBeenCalled();
    });

    it("rejeita aspectRatio que não existe nas ProcessingOptions reais do banco sem alterar o registro", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({
        status: "failed",
        errorMessage: "erro anterior",
      });

      const { retryProjectAction } = await import("~/actions/projects-actions");
      const result = await retryProjectAction(project.id, {
        aspectRatio: "21:9",
      });

      expect(result.success).toBe(false);

      const unchanged = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(unchanged?.status).toBe("failed");
      expect(mockInngestSend).not.toHaveBeenCalled();
    });

    it("reenvia de fato o projeto (status volta para queued) com updates válidos reais", async () => {
      mockGetUserId.mockResolvedValue(userId);
      const project = await createTestProject({
        status: "failed",
        errorMessage: "erro anterior",
      });
      mockInngestSend.mockResolvedValueOnce({});

      const { retryProjectAction } = await import("~/actions/projects-actions");
      const result = await retryProjectAction(project.id, {
        subtitlePreset: "GAMER",
        clipModel: "face_focus",
        aspectRatio: "1:1",
        autoZoom: true,
        sliceStartTime: 0,
        sliceEndTime: 180,
      });

      expect(result).toEqual({ success: true });

      const updated = await db.uploadedFile.findUnique({ where: { id: project.id } });
      expect(updated?.status).toBe("queued");
      expect(updated?.errorMessage).toBeNull();
      expect(updated?.subtitlePreset).toBe("GAMER");
      expect(updated?.clipModel).toBe("face_focus");
      expect(updated?.aspectRatio).toBe("1:1");
      expect(mockInngestSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("loadMoreProjectsAction", () => {
    it("rejeita sort malicioso (payload fora do enum conhecido) sem consultar o banco de forma alguma", async () => {
      mockGetUserId.mockResolvedValue(userId);

      const { loadMoreProjectsAction } = await import("~/actions/projects-actions");

      await expect(
        loadMoreProjectsAction(1, undefined, "'; DROP TABLE \"UploadedFile\"; --")
      ).rejects.toThrow();

      // Confirma que a tabela segue intacta (a tentativa de injeção, se
      // chegasse a ser usada como SQL bruto, teria apagado a tabela).
      const stillCountable = await db.uploadedFile.count({ where: { userId } });
      expect(typeof stillCountable).toBe("number");
    });

    it("lista de fato os projetos do usuário com parâmetros válidos", async () => {
      mockGetUserId.mockResolvedValue(userId);
      await createTestProject({ displayName: "Projeto listável" });

      const { loadMoreProjectsAction } = await import("~/actions/projects-actions");
      const result = await loadMoreProjectsAction(1, undefined, "desc");

      expect(result.data.length).toBeGreaterThan(0);
    });
  });
});
