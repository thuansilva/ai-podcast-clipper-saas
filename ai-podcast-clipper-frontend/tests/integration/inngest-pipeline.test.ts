/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { db } from "~/server/db";
import { env } from "~/env";
import {
  processVideo,
  processVideoHandler,
  getYouTubeDownloadEndpoint,
  type PipelineStep,
} from "~/inngest/functions";

describe("Inngest Pipeline Integration Tests", () => {
  const createdUserIds: string[] = [];

  const createMockStep = (): PipelineStep => ({
    run: vi.fn(async (_name: string, fn: () => any) => await fn()),
  });

  async function createTestUser(credits = 10, reservedCredits = 0) {
    const user = await db.user.create({
      data: {
        id: `user_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: `test-inngest-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits,
        reservedCredits,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestFile(
    userId: string,
    options: {
      durationSeconds?: number;
      sourceType?: "UPLOAD" | "YOUTUBE";
      youtubeUrl?: string | null;
      status?: string;
    } = {}
  ) {
    return await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `uploads/test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}/original.mp4`,
        displayName: "podcast-episode.mp4",
        status: options.status ?? "queued",
        durationSeconds: options.durationSeconds ?? 120,
        sourceType: options.sourceType ?? "UPLOAD",
        youtubeUrl: options.youtubeUrl ?? null,
      },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("Cenário 1: Sucesso de ponta a ponta (hold -> GPU -> clipes persistidos -> consume -> status processed)", async () => {
    const user = await createTestUser(10, 0);
    // 120s de vídeo -> 2 créditos
    const file = await createTestFile(user.id, { durationSeconds: 120 });

    const mockClips = [
      {
        s3_key: `uploads/${file.id}/clip_0.mp4`,
        title: "Primeiro Momento Viral",
        hook: "Você não vai acreditar nisso",
        virality_score: 9,
        reason: "Gancho emocionante e resolução rápida",
        start: 12.0,
        end: 45.0,
        duration: 33.0,
        preset: "HORMOZI",
        layout_mode: "SMART_CROP",
        words: [
          { word: "Você", start: 12.0, end: 12.4 },
          { word: "não", start: 12.4, end: 12.7 },
        ],
      },
      {
        s3_key: `uploads/${file.id}/clip_1.mp4`,
        title: "Segundo Momento Viral",
        hook: "O grande segredo revelado",
        virality_score: 8,
        reason: "Forte elemento de curiosidade",
        start: 50.0,
        end: 95.0,
        duration: 45.0,
        preset: "HORMOZI",
        layout_mode: "SMART_CROP",
        words: [
          { word: "O", start: 50.0, end: 50.3 },
          { word: "grande", start: 50.3, end: 50.7 },
        ],
      },
    ];

    // Mock fetch para o endpoint de GPU do Modal
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: file.s3Key,
            clips: mockClips,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const mockStep = createMockStep();

    // Executa o handler da função Inngest
    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
          preset: "HORMOZI",
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    // 1. Verificar estado do usuário: 10 - 2 = 8 credits, 0 reservedCredits
    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(8);
    expect(updatedUser.reservedCredits).toBe(0);

    // 2. Verificar estado do UploadedFile: status = "processed", errorMessage = null
    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(updatedFile.status).toBe("processed");
    expect(updatedFile.errorMessage).toBeNull();
    expect(updatedFile.creditsCost).toBe(2);

    // 3. Verificar persistência dos clipes
    const savedClips = await db.clip.findMany({
      where: { uploadedFileId: file.id },
      orderBy: { startTime: "asc" },
    });
    expect(savedClips).toHaveLength(2);
    expect(savedClips[0]!.title).toBe("Primeiro Momento Viral");
    expect(savedClips[0]!.hook).toBe("Você não vai acreditar nisso");
    expect(savedClips[0]!.viralityScore).toBe(9);
    expect(savedClips[0]!.startTime).toBe(12.0);
    expect(savedClips[0]!.endTime).toBe(45.0);
    expect(savedClips[0]!.subtitlePreset).toBe("HORMOZI");
    expect(savedClips[0]!.layoutMode).toBe("SMART_CROP");
    expect(savedClips[0]!.transcriptWords).toBeDefined();

    expect(savedClips[1]!.title).toBe("Segundo Momento Viral");
    expect(savedClips[1]!.viralityScore).toBe(8);

    // 4. Verificar transações de crédito: HOLD e CONSUME
    const transactions = await db.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.type).toBe("HOLD");
    expect(transactions[0]!.amount).toBe(2);
    expect(transactions[1]!.type).toBe("CONSUME");
    expect(transactions[1]!.amount).toBe(2);
  });

  it("Cenário 2: Falha na chamada da IA (hold -> erro -> refund atômico de 100% -> status failed com errorMessage)", async () => {
    const user = await createTestUser(10, 0);
    // 120s -> 2 créditos
    const file = await createTestFile(user.id, { durationSeconds: 120 });

    // Mock fetch simulando erro 500 no Modal GPU
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({ detail: "CUDA out of memory in WhisperX alignment" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const mockStep = createMockStep();

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(false);

    // 1. Usuário deve receber 100% dos créditos retidos de volta (10 credits, 0 reservedCredits)
    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(10);
    expect(updatedUser.reservedCredits).toBe(0);

    // 2. UploadedFile deve estar com status "failed" e conter errorMessage explicativa
    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(updatedFile.status).toBe("failed");
    expect(updatedFile.errorMessage).not.toBeNull();
    expect(updatedFile.errorMessage).toMatch(/Modal GPU|CUDA out of memory|500/i);

    // 3. Nenhum clipe deve ter sido persistido
    const savedClips = await db.clip.findMany({
      where: { uploadedFileId: file.id },
    });
    expect(savedClips).toHaveLength(0);

    // 4. Deve haver transação de HOLD seguida por REFUND
    const transactions = await db.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.type).toBe("HOLD");
    expect(transactions[0]!.amount).toBe(2);
    expect(transactions[1]!.type).toBe("REFUND");
    expect(transactions[1]!.amount).toBe(2);
  });

  it("Cenário 3: Falha por saldo insuficiente (rejeição imediata sem débito indevido)", async () => {
    // Usuário tem apenas 1 crédito
    const user = await createTestUser(1, 0);
    // Vídeo de 180s exige ceil(180/60) = 3 créditos
    const file = await createTestFile(user.id, { durationSeconds: 180 });

    const mockFetch = vi.spyOn(globalThis, "fetch");
    const mockStep = createMockStep();

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(false);

    // 1. Usuário mantém o saldo de 1 crédito intacto e 0 retidos
    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(1);
    expect(updatedUser.reservedCredits).toBe(0);

    // 2. UploadedFile deve ser marcado com status de erro ("no credits" ou "failed") e mensagem informativa
    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(["no credits", "failed"]).toContain(updatedFile.status);
    expect(updatedFile.errorMessage).toMatch(/insufficient credits|saldo insuficiente/i);

    // 3. Nenhuma chamada de rede para a GPU deve ter ocorrido
    expect(mockFetch).not.toHaveBeenCalled();

    // 4. Nenhuma transação de crédito deve ter sido criada
    const transactions = await db.creditTransaction.findMany({
      where: { userId: user.id },
    });
    expect(transactions).toHaveLength(0);
  });

  it("Cenário 4: Sucesso com vídeo originado do YouTube (download via CPU -> hold -> GPU -> persistência)", async () => {
    const user = await createTestUser(10, 0);
    const youtubeUrl = "https://www.youtube.com/watch?v=mockyt123";
    const file = await createTestFile(user.id, {
      sourceType: "YOUTUBE",
      youtubeUrl,
      durationSeconds: 0, // Duração ainda desconhecida antes do download
    });

    const ytEndpoint = getYouTubeDownloadEndpoint();
    const mockDownloadResponse = {
      success: true,
      s3_key: `youtube/${file.id}/original.mp4`,
      title: "Podcast Exclusivo YouTube",
      duration: 180, // 180s -> 3 créditos
      thumbnail: "https://img.youtube.com/vi/mockyt123/hqdefault.jpg",
    };

    const mockClips = [
      {
        s3_key: `youtube/${file.id}/clip_0.mp4`,
        title: "Melhor Momento do Episódio",
        hook: "A virada inesperada",
        virality_score: 10,
        reason: "Clímax narrativo",
        start: 30.0,
        end: 75.0,
        duration: 45.0,
        preset: "NEON",
        layout_mode: "SMART_CROP",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr === ytEndpoint) {
        return new Response(JSON.stringify(mockDownloadResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: mockDownloadResponse.s3_key,
            clips: mockClips,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const mockStep = createMockStep();

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
          preset: "NEON",
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    // 1. File deve ter atualizado durationSeconds, s3Key, displayName e status
    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(updatedFile.durationSeconds).toBe(180);
    expect(updatedFile.s3Key).toBe(mockDownloadResponse.s3_key);
    expect(updatedFile.displayName).toBe("Podcast Exclusivo YouTube");
    expect(updatedFile.status).toBe("processed");
    expect(updatedFile.creditsCost).toBe(3);

    // 2. Créditos do usuário: 10 - 3 = 7
    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(7);
    expect(updatedUser.reservedCredits).toBe(0);

    // 3. Clipe persistido
    const savedClips = await db.clip.findMany({
      where: { uploadedFileId: file.id },
    });
    expect(savedClips).toHaveLength(1);
    expect(savedClips[0]!.title).toBe("Melhor Momento do Episódio");
    expect(savedClips[0]!.subtitlePreset).toBe("NEON");

    // 4. Transações HOLD e CONSUME
    const transactions = await db.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.type).toBe("HOLD");
    expect(transactions[0]!.amount).toBe(3);
    expect(transactions[1]!.type).toBe("CONSUME");
    expect(transactions[1]!.amount).toBe(3);
  });

  it("Cenário 5: Falha no download do YouTube (vídeo indisponível) não debita créditos", async () => {
    const user = await createTestUser(10, 0);
    const file = await createTestFile(user.id, {
      sourceType: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=unavailable",
      durationSeconds: 0,
    });

    const ytEndpoint = getYouTubeDownloadEndpoint();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr === ytEndpoint) {
        return new Response(
          JSON.stringify({ detail: "YouTube video unavailable: Video unavailable" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const mockStep = createMockStep();

    const result = await processVideoHandler({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(false);

    // Créditos do usuário permanecem intactos (10, 0)
    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(10);
    expect(updatedUser.reservedCredits).toBe(0);

    // UploadedFile marcado como failed com mensagem de erro
    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(updatedFile.status).toBe("failed");
    expect(updatedFile.errorMessage).toMatch(/YouTube|unavailable|404/i);

    // Nenhuma transação criada
    const transactions = await db.creditTransaction.findMany({
      where: { userId: user.id },
    });
    expect(transactions).toHaveLength(0);
  });

  it("Cenário 6: InngestFunction wrapper (processVideo.fn) e fallback onFailureFn", async () => {
    const user = await createTestUser(10, 0);
    const file = await createTestFile(user.id, { durationSeconds: 60 });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr === env.PROCESS_VIDEO_ENDPOINT) {
        return new Response(
          JSON.stringify({
            success: true,
            file_id: file.s3Key,
            clips: [
              {
                s3_key: `uploads/${file.id}/clip_0.mp4`,
                title: "Short Clip",
                start: 0.0,
                end: 30.0,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const mockStep = createMockStep();

    // Invoca diretamente o método .fn do InngestFunction
    const inngestFn = (processVideo as unknown as { fn: Function }).fn;
    expect(typeof inngestFn).toBe("function");

    const result = await inngestFn({
      event: {
        data: {
          uploadedFileId: file.id,
          userId: user.id,
        },
      },
      step: mockStep,
    });

    expect(result.success).toBe(true);

    const updatedUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.credits).toBe(9); // 60s -> 1 crédito debitado
    expect(updatedUser.reservedCredits).toBe(0);

    const updatedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(updatedFile.status).toBe("processed");

    // Testa também o onFailureFn fallback
    const onFailureFn = (processVideo as unknown as { onFailureFn?: Function }).onFailureFn;
    expect(typeof onFailureFn).toBe("function");
    if (onFailureFn) {
      // Simula uma falha em arquivo com créditos retidos
      const failUser = await createTestUser(8, 2);
      const failFile = await createTestFile(failUser.id, { durationSeconds: 120 });
      await db.uploadedFile.update({
        where: { id: failFile.id },
        data: { creditsCost: 2, status: "processing" },
      });

      await onFailureFn({
        event: {
          data: {
            event: {
              data: {
                uploadedFileId: failFile.id,
                userId: failUser.id,
              },
            },
          },
        },
        error: new Error("Simulated unhandled worker crash"),
      });

      const refundedUser = await db.user.findUniqueOrThrow({
        where: { id: failUser.id },
      });
      expect(refundedUser.credits).toBe(10);
      expect(refundedUser.reservedCredits).toBe(0);

      const failedFile = await db.uploadedFile.findUniqueOrThrow({
        where: { id: failFile.id },
      });
      expect(failedFile.status).toBe("failed");
      expect(failedFile.errorMessage).toMatch(/crash/i);
    }
  });
});
