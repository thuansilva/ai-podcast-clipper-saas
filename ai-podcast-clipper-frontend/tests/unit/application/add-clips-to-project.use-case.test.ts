import { describe, it, expect, beforeEach } from "vitest";
import { AddClipsToProjectUseCase } from "~/application/use-cases/add-clips-to-project.use-case";
import { InMemoryUploadedFileRepository } from "../../mocks/in-memory-uploaded-file-repository";
import { InMemoryClipRepository } from "../../mocks/in-memory-clip-repository";
import { InMemoryQueueGateway } from "../../mocks/in-memory-queue-gateway";
import { InMemoryProcessingBatchRepository } from "../../mocks/in-memory-processing-batch-repository";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { UnsupportedAppendSourceError } from "~/domain/errors/unsupported-append-source-error";
import { ProjectBatchInProgressError } from "~/domain/errors/project-batch-in-progress-error";
import { LegacyClipsMissingSourceRangeError } from "~/domain/errors/legacy-clips-missing-source-range-error";
import { ManualCutOverlapError } from "~/domain/errors/manual-cut-overlap-error";
import { ManualCutsRequiredError } from "~/domain/errors/manual-cuts-required-error";
import { AiSliceRequiredError } from "~/domain/errors/ai-slice-required-error";

describe("AddClipsToProjectUseCase", () => {
  let uploadedFileRepository: InMemoryUploadedFileRepository;
  let clipRepository: InMemoryClipRepository;
  let processingBatchRepository: InMemoryProcessingBatchRepository;
  let queueGateway: InMemoryQueueGateway;
  let useCase: AddClipsToProjectUseCase;

  beforeEach(() => {
    uploadedFileRepository = new InMemoryUploadedFileRepository();
    clipRepository = new InMemoryClipRepository();
    processingBatchRepository = new InMemoryProcessingBatchRepository();
    queueGateway = new InMemoryQueueGateway();
    useCase = new AddClipsToProjectUseCase(
      uploadedFileRepository,
      clipRepository,
      processingBatchRepository,
      queueGateway
    );
  });

  async function createYouTubeProject(overrides: Partial<{
    userId: string;
    s3Key: string;
    youtubeUrl: string | null;
    sourceType: "YOUTUBE" | "UPLOAD";
  }> = {}) {
    return uploadedFileRepository.create({
      userId: overrides.userId ?? "user-1",
      s3Key: overrides.s3Key ?? "youtube/abc/original.mp4",
      sourceType: overrides.sourceType ?? "YOUTUBE",
      youtubeUrl:
        overrides.youtubeUrl === undefined
          ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          : overrides.youtubeUrl,
      status: "processed",
    });
  }

  describe("validações de propriedade e tipo de origem", () => {
    it("lança NotFoundError se o projeto não existir", async () => {
      await expect(
        useCase.execute({
          projectId: "non-existent",
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 10, endTime: 20 }],
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("lança UnauthorizedError se o userId não for o dono do projeto (IDOR)", async () => {
      const project = await createYouTubeProject({ userId: "owner" });

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "attacker",
          mode: "manual",
          manualCuts: [{ startTime: 10, endTime: 20 }],
        })
      ).rejects.toThrow(UnauthorizedError);

      expect(queueGateway.sentAppendEvents).toHaveLength(0);
    });

    it("lança UnsupportedAppendSourceError se o projeto não for sourceType YOUTUBE", async () => {
      const project = await createYouTubeProject({ sourceType: "UPLOAD" });

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 10, endTime: 20 }],
        })
      ).rejects.toThrow(UnsupportedAppendSourceError);
    });

    it("lança UnsupportedAppendSourceError se o projeto YOUTUBE não tiver youtubeUrl", async () => {
      const project = await createYouTubeProject({ youtubeUrl: null });

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 10, endTime: 20 }],
        })
      ).rejects.toThrow(UnsupportedAppendSourceError);
    });
  });

  describe("bloqueio de processamento concorrente", () => {
    it("lança ProjectBatchInProgressError se já houver um lote queued/processing", async () => {
      const project = await createYouTubeProject();
      await processingBatchRepository.create({
        uploadedFileId: project.id,
        mode: "manual",
        rangesJson: [{ startTime: 0, endTime: 10 }],
        status: "processing",
      });

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 100, endTime: 110 }],
        })
      ).rejects.toThrow(ProjectBatchInProgressError);
    });

    it("permite criar um novo lote se o lote anterior já terminou (processed/failed)", async () => {
      const project = await createYouTubeProject();
      await processingBatchRepository.create({
        uploadedFileId: project.id,
        mode: "manual",
        rangesJson: [{ startTime: 0, endTime: 10 }],
        status: "processed",
      });
      await processingBatchRepository.create({
        uploadedFileId: project.id,
        mode: "manual",
        rangesJson: [{ startTime: 20, endTime: 30 }],
        status: "failed",
      });

      const result = await useCase.execute({
        projectId: project.id,
        userId: "user-1",
        mode: "manual",
        manualCuts: [{ startTime: 100, endTime: 110 }],
      });

      expect(result.success).toBe(true);
    });

    it("RNF-SEC (race): 2 execuções simultâneas no mesmo projeto (2 abas/2 cliques) criam no máximo 1 lote e enviam no máximo 1 evento — a outra recebe ProjectBatchInProgressError", async () => {
      const project = await createYouTubeProject();

      const results = await Promise.allSettled([
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 100, endTime: 110 }],
        }),
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 105, endTime: 115 }],
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(ProjectBatchInProgressError);

      const batches = await processingBatchRepository.findByUploadedFileId(
        project.id
      );
      expect(batches).toHaveLength(1);
      expect(queueGateway.sentAppendEvents).toHaveLength(1);
    });
  });

  describe("clipes legados sem sourceStartTime/sourceEndTime", () => {
    it("lança LegacyClipsMissingSourceRangeError se algum clipe existente não tiver sourceStartTime/sourceEndTime", async () => {
      const project = await createYouTubeProject();
      await clipRepository.createMany([
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-legado.mp4",
          title: "Clip legado",
          startTime: 5,
          endTime: 15,
          durationSeconds: 10,
          // sourceStartTime/sourceEndTime ausentes de propósito
        },
      ]);

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [{ startTime: 100, endTime: 110 }],
        })
      ).rejects.toThrow(LegacyClipsMissingSourceRangeError);

      expect(queueGateway.sentAppendEvents).toHaveLength(0);
    });
  });

  describe("modo manual", () => {
    it("lança ManualCutsRequiredError quando manualCuts está vazio/ausente", async () => {
      const project = await createYouTubeProject();

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          manualCuts: [],
        })
      ).rejects.toThrow(ManualCutsRequiredError);
    });

    it("lança ManualCutOverlapError (bloqueio, não apenas aviso) quando o corte novo se sobrepõe a um clipe já existente", async () => {
      const project = await createYouTubeProject();
      await clipRepository.createMany([
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-1.mp4",
          title: "Clip 1",
          startTime: 50,
          endTime: 70,
          sourceStartTime: 100,
          sourceEndTime: 120,
          durationSeconds: 20,
        },
      ]);

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "manual",
          // 110-130 se sobrepõe a 100-120
          manualCuts: [{ startTime: 110, endTime: 130 }],
        })
      ).rejects.toThrow(ManualCutOverlapError);

      expect(queueGateway.sentAppendEvents).toHaveLength(0);
      expect(await processingBatchRepository.findByUploadedFileId(project.id)).toHaveLength(0);
    });

    it("não bloqueia cortes apenas 'encostados' (sem segundo em comum) num clipe existente", async () => {
      const project = await createYouTubeProject();
      await clipRepository.createMany([
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-1.mp4",
          title: "Clip 1",
          startTime: 50,
          endTime: 70,
          sourceStartTime: 100,
          sourceEndTime: 120,
          durationSeconds: 20,
        },
      ]);

      const result = await useCase.execute({
        projectId: project.id,
        userId: "user-1",
        mode: "manual",
        manualCuts: [{ startTime: 120, endTime: 140 }],
      });

      expect(result.success).toBe(true);
    });

    it("cria o lote e envia o evento de append com os cortes novos e excludedRanges vazio", async () => {
      const project = await createYouTubeProject();
      await clipRepository.createMany([
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-1.mp4",
          title: "Clip 1",
          startTime: 0,
          endTime: 20,
          sourceStartTime: 0,
          sourceEndTime: 20,
          durationSeconds: 20,
        },
      ]);

      const manualCuts = [
        { title: "Corte novo", startTime: 200, endTime: 230 },
      ];

      const result = await useCase.execute({
        projectId: project.id,
        userId: "user-1",
        mode: "manual",
        manualCuts,
      });

      expect(result.success).toBe(true);
      expect(result.batchId).toBeDefined();

      const batches = await processingBatchRepository.findByUploadedFileId(project.id);
      expect(batches).toHaveLength(1);
      expect(batches[0]!.mode).toBe("manual");
      expect(batches[0]!.status).toBe("queued");
      expect(batches[0]!.rangesJson).toEqual(manualCuts);

      expect(queueGateway.sentAppendEvents).toHaveLength(1);
      expect(queueGateway.sentAppendEvents[0]).toEqual({
        uploadedFileId: project.id,
        batchId: result.batchId,
        userId: "user-1",
        mode: "manual",
        manualCuts,
        aiSlice: undefined,
        excludedRanges: [],
      });

      // Clipe antigo nunca é apagado.
      expect(await clipRepository.findByUploadedFileId(project.id)).toHaveLength(1);
    });
  });

  describe("modo automático (IA gera mais sobre um novo slice)", () => {
    it("lança AiSliceRequiredError quando aiSlice está ausente", async () => {
      const project = await createYouTubeProject();

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "auto",
        })
      ).rejects.toThrow(AiSliceRequiredError);
    });

    it("lança AiSliceRequiredError quando aiSlice.endTime <= aiSlice.startTime", async () => {
      const project = await createYouTubeProject();

      await expect(
        useCase.execute({
          projectId: project.id,
          userId: "user-1",
          mode: "auto",
          aiSlice: { startTime: 300, endTime: 300 },
        })
      ).rejects.toThrow(AiSliceRequiredError);
    });

    it("calcula excludedRanges como a interseção dos clipes já usados com o slice escolhido (recortado aos limites do slice)", async () => {
      const project = await createYouTubeProject();
      await clipRepository.createMany([
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-1.mp4",
          title: "Clip 1",
          startTime: 0,
          endTime: 20,
          // Totalmente fora do slice [200, 400) -> não entra em excludedRanges
          sourceStartTime: 0,
          sourceEndTime: 20,
          durationSeconds: 20,
        },
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-2.mp4",
          title: "Clip 2",
          startTime: 190,
          endTime: 210,
          // Parcialmente dentro do slice -> recortado para [200, 210)
          sourceStartTime: 190,
          sourceEndTime: 210,
          durationSeconds: 20,
        },
        {
          userId: "user-1",
          uploadedFileId: project.id,
          s3Key: "clip-3.mp4",
          title: "Clip 3",
          startTime: 250,
          endTime: 270,
          // Totalmente dentro do slice -> entra como está
          sourceStartTime: 250,
          sourceEndTime: 270,
          durationSeconds: 20,
        },
      ]);

      const result = await useCase.execute({
        projectId: project.id,
        userId: "user-1",
        mode: "auto",
        aiSlice: { startTime: 200, endTime: 400 },
      });

      expect(queueGateway.sentAppendEvents).toHaveLength(1);
      expect(queueGateway.sentAppendEvents[0]!.excludedRanges).toEqual([
        { start: 200, end: 210 },
        { start: 250, end: 270 },
      ]);
      expect(queueGateway.sentAppendEvents[0]!.aiSlice).toEqual({
        startTime: 200,
        endTime: 400,
      });
      expect(queueGateway.sentAppendEvents[0]!.manualCuts).toBeUndefined();

      const batches = await processingBatchRepository.findByUploadedFileId(project.id);
      expect(batches[0]!.mode).toBe("auto");
      expect(batches[0]!.rangesJson).toEqual({ startTime: 200, endTime: 400 });
      expect(batches[0]!.excludedRangesJson).toEqual([
        { start: 200, end: 210 },
        { start: 250, end: 270 },
      ]);
      expect(result.success).toBe(true);
    });
  });
});
