/**
 * @vitest-environment node
 *
 * Testes de integração: exercitam a Server Action real
 * (`~/actions/youtube`), passando pelo schema real de borda
 * (`import-youtube-video.schema.ts`), pelo value object real de domínio
 * (`YouTubeUrl`), pelo use case real (`ImportYouTubeVideoUseCase`) e pelo
 * repositório real (Prisma, banco de testes via docker-compose). Apenas
 * autenticação (Clerk) e a fila (Inngest) são mockadas.
 *
 * Objetivo principal: comprovar que um payload malicioso enviado "de fora"
 * (ex: via curl direto na Server Action, ignorando qualquer checagem de UI)
 * é rejeitado ANTES de qualquer escrita no banco ou envio de evento.
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

describe("importYouTubeVideo - Integração (schema real + value object real + use case real + Prisma real)", () => {
  useRollbackTransactionPerTest();

  const userId = `user_youtube_it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const validUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  // Opções administráveis (ProcessingOption) que importYouTubeVideo valida em
  // runtime (genre, aspectRatio, clipModel). Criadas em cada teste dentro da
  // transação de rollback (não vêm do seed).
  const testProcessingOptions: Prisma.ProcessingOptionCreateInput[] = [
    { type: "GENRE", value: "humor", label: "Humor (teste)" },
    { type: "ASPECT_RATIO", value: "9:16", label: "9:16 (teste)" },
    { type: "CLIP_MODEL", value: "face_focus", label: "Foco no Rosto (teste)" },
  ];

  beforeEach(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `youtube-it-${Date.now()}@example.com`,
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

  it("rejeita url vazia (payload malicioso) sem criar nenhum registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({ url: "" });

    expect(result.success).toBe(false);

    const countAfter = await db.uploadedFile.count({ where: { userId } });
    expect(countAfter).toBe(0);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita mode fora do enum auto|manual sem criar nenhum registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({
      url: validUrl,
      mode: "sabotage" as never,
    });

    expect(result.success).toBe(false);

    const countAfter = await db.uploadedFile.count({ where: { userId } });
    expect(countAfter).toBe(0);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita manualCuts com endTime <= startTime sem criar nenhum registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({
      url: validUrl,
      mode: "manual",
      manualCuts: [{ startTime: 50, endTime: 10 }],
    });

    expect(result.success).toBe(false);

    const countAfter = await db.uploadedFile.count({ where: { userId } });
    expect(countAfter).toBe(0);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita manualCuts com mais de 50 cortes (payload malicioso) sem criar nenhum registro no banco", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const manualCuts = Array.from({ length: 51 }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({
      url: validUrl,
      mode: "manual",
      manualCuts,
    });

    expect(result.success).toBe(false);

    const countAfter = await db.uploadedFile.count({ where: { userId } });
    expect(countAfter).toBe(0);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("rejeita clipModel que não existe nas ProcessingOptions reais do banco (regra de negócio, não só schema)", async () => {
    mockGetUserId.mockResolvedValue(userId);

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({
      url: validUrl,
      clipModel: "modelo_que_nao_existe",
    });

    expect(result).toEqual({ success: false, error: "Invalid clip model" });

    const countAfter = await db.uploadedFile.count({ where: { userId } });
    expect(countAfter).toBe(0);
  });

  it("importa de fato o vídeo, cria o UploadedFile real e envia o evento ao Inngest com dados válidos", async () => {
    mockGetUserId.mockResolvedValue(userId);
    mockInngestSend.mockResolvedValueOnce({});

    const { importYouTubeVideo } = await import("~/actions/youtube");
    const result = await importYouTubeVideo({
      url: validUrl,
      genre: "humor",
      clipModel: "face_focus",
      aspectRatio: "9:16",
      mode: "manual",
      manualCuts: [{ id: "cut-1", title: "Corte 1", startTime: 5, endTime: 20 }],
    });

    expect(result.success).toBe(true);
    expect(result.uploadedFileId).toBeDefined();

    const created = await db.uploadedFile.findUnique({
      where: { id: result.uploadedFileId! },
    });
    expect(created).not.toBeNull();
    expect(created?.sourceType).toBe("YOUTUBE");
    expect(created?.genre).toBe("humor");
    expect(created?.clipModel).toBe("face_focus");
    expect(created?.aspectRatio).toBe("9:16");

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "process-video-events",
        data: expect.objectContaining({
          uploadedFileId: result.uploadedFileId,
          userId,
          mode: "manual",
          manualCuts: [
            { id: "cut-1", title: "Corte 1", startTime: 5, endTime: 20 },
          ],
        }),
      }),
    );
  });
});
