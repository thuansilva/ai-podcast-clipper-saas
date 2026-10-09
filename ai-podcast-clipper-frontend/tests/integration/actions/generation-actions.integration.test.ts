/**
 * @vitest-environment node
 *
 * Teste de integração para `processVideo` (`~/actions/generation`):
 * exercita a Server Action real, passando pelo schema real de borda
 * (`process-video.schema.ts`), pelo use case real
 * (`TriggerVideoProcessingUseCase`) e pelo repositório real (Prisma, banco
 * de testes via docker-compose). Apenas autenticação (Clerk) e a fila
 * (Inngest) são mockadas.
 *
 * Objetivo principal: comprovar que um payload malicioso enviado "de fora"
 * (ex: via curl direto na Server Action, ignorando qualquer checagem de UI)
 * é rejeitado ANTES de qualquer escrita no banco ou envio de evento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("processVideo - Integração (schema real + use case real + Prisma real)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_generation_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  beforeEach(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `generation-it-${Date.now()}@example.com`,
        password: "hashedpassword123",
        credits: 50,
      },
    });
  });

  afterEach(() => {
    mockGetUserId.mockReset();
    mockInngestSend.mockReset();
  });

  async function createTestUploadedFile(overrides: Record<string, unknown> = {}) {
    return db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`,
        displayName: "Projeto de teste",
        status: "queued",
        uploaded: false,
        ...overrides,
      },
    });
  }

  it("rejeita uploadedFileId vazio (payload malicioso) sem tocar no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const { processVideo } = await import("~/actions/generation");

    await expect(processVideo("")).rejects.toThrow();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita mode fora do enum auto|manual sem alterar o registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);
    const file = await createTestUploadedFile();

    const { processVideo } = await import("~/actions/generation");

    await expect(
      processVideo(file.id, "HORMOZI", "sabotage" as never),
    ).rejects.toThrow();

    const unchanged = await db.uploadedFile.findUnique({ where: { id: file.id } });
    expect(unchanged?.uploaded).toBe(false);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita manualCuts com endTime <= startTime sem alterar o registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);
    const file = await createTestUploadedFile();

    const { processVideo } = await import("~/actions/generation");

    await expect(
      processVideo(file.id, "HORMOZI", "manual", [{ startTime: 40, endTime: 10 }]),
    ).rejects.toThrow();

    const unchanged = await db.uploadedFile.findUnique({ where: { id: file.id } });
    expect(unchanged?.uploaded).toBe(false);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita manualCuts com mais de 50 cortes (payload malicioso) sem alterar o registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);
    const file = await createTestUploadedFile();

    const manualCuts = Array.from({ length: 51 }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const { processVideo } = await import("~/actions/generation");

    await expect(
      processVideo(file.id, "HORMOZI", "manual", manualCuts),
    ).rejects.toThrow();

    const unchanged = await db.uploadedFile.findUnique({ where: { id: file.id } });
    expect(unchanged?.uploaded).toBe(false);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("dispara de fato o processamento, marca uploaded=true e persiste manualCutsJson com dados válidos", async () => {
    mockGetUserId.mockResolvedValue(userId);
    mockInngestSend.mockResolvedValueOnce({});
    const file = await createTestUploadedFile();

    const manualCuts = [{ id: "cut-1", title: "Corte 1", startTime: 10, endTime: 40 }];

    const { processVideo } = await import("~/actions/generation");
    await processVideo(file.id, "HORMOZI", "manual", manualCuts);

    const updated = await db.uploadedFile.findUnique({ where: { id: file.id } });
    expect(updated?.uploaded).toBe(true);
    expect(updated?.manualCutsJson).toEqual(JSON.stringify(manualCuts));

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "process-video-events",
        data: expect.objectContaining({
          uploadedFileId: file.id,
          userId,
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        }),
      }),
    );
  });
});
