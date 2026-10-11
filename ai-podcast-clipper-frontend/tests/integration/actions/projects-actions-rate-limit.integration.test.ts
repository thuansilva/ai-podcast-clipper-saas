/**
 * @vitest-environment node
 *
 * Testes de integração: exercita a Server Action real
 * (`~/actions/projects-actions`), passando pelo schema real de borda, pelo
 * use case real e pelo repositório real (Prisma, banco de testes via
 * docker-compose), com o rate limiter real (não mockado). Apenas
 * autenticação (Clerk) e cache do Next são mockados.
 *
 * Objetivo: comprovar que, acima do limite, renameProjectAction retorna erro
 * de rate limit ANTES de tocar no banco (o registro permanece com o nome
 * antigo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../../helpers/with-rollback-transaction";

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

describe("renameProjectAction - Integração (rate limiter real + Prisma real)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_projects_rl_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  beforeEach(async () => {
    mockGetUserId.mockResolvedValue(userId);
    await db.user.create({
      data: {
        id: userId,
        email: `projects-rl-it-${Date.now()}@example.com`,
        password: "hashedpassword123",
        credits: 50,
      },
    });
  });

  afterEach(() => {
    mockGetUserId.mockReset();
  });

  it("bloqueia a 21a renomeação no mesmo minuto sem alterar o registro no banco", async () => {
    const project = await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/rl-it-${Date.now()}.mp4`,
        displayName: "Nome original",
        status: "failed",
      },
    });

    const { renameProjectAction } = await import("~/actions/projects-actions");

    for (let i = 0; i < 20; i++) {
      const result = await renameProjectAction(project.id, `Nome ${i}`);
      expect(result.success).toBe(true);
    }

    const blocked = await renameProjectAction(project.id, "Nome bloqueado");
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("Too many requests");

    const unchanged = await db.uploadedFile.findUnique({
      where: { id: project.id },
    });
    expect(unchanged?.displayName).toBe("Nome 19");
  });
});
