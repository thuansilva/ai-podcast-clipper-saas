import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { UnsupportedAppendSourceError } from "~/domain/errors/unsupported-append-source-error";
import { ProjectBatchInProgressError } from "~/domain/errors/project-batch-in-progress-error";
import { LegacyClipsMissingSourceRangeError } from "~/domain/errors/legacy-clips-missing-source-range-error";
import { ManualCutsRequiredError } from "~/domain/errors/manual-cuts-required-error";
import { ManualCutOverlapError } from "~/domain/errors/manual-cut-overlap-error";
import { AiSliceRequiredError } from "~/domain/errors/ai-slice-required-error";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IProcessingBatchRepository } from "~/domain/ports/processing-batch-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";
import {
  clipRangesToContainer,
  findOverlappingRange,
  type TimeRange,
} from "~/domain/services/range-overlap.service";
import type {
  AddClipsToProjectInput,
  AddClipsToProjectOutput,
} from "~/application/dtos/video-dtos";

/**
 * Use Case: AddClipsToProjectUseCase ("adicionar mais cortes" a um projeto
 * já existente — manual ou IA sobre um novo slice).
 *
 * Decisões de contrato (ver relato completo no handback da tarefa):
 * - Nunca apaga clipes existentes nem reseta o `UploadedFile` inteiro — cria
 *   um `ProjectProcessingBatch` próprio, isolado, com seu próprio
 *   `status`/`creditsCost`/`s3Key`.
 * - Só aceita projetos `sourceType === "YOUTUBE"` com `youtubeUrl`
 *   preenchido (uploads diretos não têm de onde re-baixar o range/slice
 *   novo).
 * - Bloqueia (não só avisa) corte manual novo que se sobrepõe a um clipe já
 *   existente do projeto.
 * - Para o slice de IA, calcula `excludedRanges` = intervalos já usados que
 *   caem dentro do slice (recortados aos limites dele) — SEMPRE enviado ao
 *   evento (pode ser `[]`), em segundos absolutos no vídeo ORIGINAL.
 * - Trata com segurança (bloqueia) projetos com algum clipe legado sem
 *   `sourceStartTime`/`sourceEndTime` (não há como calcular intervalos já
 *   usados com certeza nesse caso).
 */
export class AddClipsToProjectUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly clipRepository: IClipRepository,
    private readonly processingBatchRepository: IProcessingBatchRepository,
    private readonly queueGateway: IQueueGateway
  ) {}

  async execute(
    input: AddClipsToProjectInput
  ): Promise<AddClipsToProjectOutput> {
    const project = await this.uploadedFileRepository.findById(
      input.projectId
    );
    if (!project) {
      throw new NotFoundError("Projeto", input.projectId);
    }
    if (project.userId !== input.userId) {
      throw new UnauthorizedError("adicionar cortes a este projeto");
    }
    if (project.sourceType !== "YOUTUBE" || !project.youtubeUrl) {
      throw new UnsupportedAppendSourceError();
    }

    const activeBatches =
      await this.processingBatchRepository.findActiveByUploadedFileId(
        project.id
      );
    if (activeBatches.length > 0) {
      throw new ProjectBatchInProgressError();
    }

    const existingClips = await this.clipRepository.findByUploadedFileId(
      project.id
    );
    if (
      existingClips.some(
        (clip) => clip.sourceStartTime == null || clip.sourceEndTime == null
      )
    ) {
      throw new LegacyClipsMissingSourceRangeError();
    }

    const usedRanges: TimeRange[] = existingClips.map((clip) => ({
      start: clip.sourceStartTime!,
      end: clip.sourceEndTime!,
    }));

    let rangesJson: unknown;
    let excludedRanges: TimeRange[];

    if (input.mode === "manual") {
      const manualCuts = input.manualCuts ?? [];
      if (manualCuts.length === 0) {
        throw new ManualCutsRequiredError();
      }

      for (const cut of manualCuts) {
        const overlap = findOverlappingRange(
          { start: cut.startTime, end: cut.endTime },
          usedRanges
        );
        if (overlap) {
          throw new ManualCutOverlapError(
            cut.startTime,
            cut.endTime,
            overlap.start,
            overlap.end
          );
        }
      }

      rangesJson = manualCuts;
      excludedRanges = [];
    } else {
      const aiSlice = input.aiSlice;
      if (!aiSlice || aiSlice.endTime <= aiSlice.startTime) {
        throw new AiSliceRequiredError();
      }

      const sliceRange: TimeRange = {
        start: aiSlice.startTime,
        end: aiSlice.endTime,
      };
      rangesJson = { startTime: aiSlice.startTime, endTime: aiSlice.endTime };
      excludedRanges = clipRangesToContainer(usedRanges, sliceRange);
    }

    // Checagem + criação ATÔMICAS: a checagem de `activeBatches` acima é só
    // um fail-fast barato; ela sozinha deixava 2 requests simultâneas
    // criarem 2 lotes (auditoria de segurança — race de 2 abas/2 cliques).
    const batch = await this.processingBatchRepository.createIfNoActive({
      uploadedFileId: project.id,
      mode: input.mode,
      rangesJson,
      excludedRangesJson: excludedRanges,
      status: "queued",
    });
    if (!batch) {
      throw new ProjectBatchInProgressError();
    }

    await this.queueGateway.sendAddClipsToProjectEvent({
      uploadedFileId: project.id,
      batchId: batch.id,
      userId: input.userId,
      mode: input.mode,
      manualCuts: input.mode === "manual" ? input.manualCuts : undefined,
      aiSlice: input.mode === "auto" ? input.aiSlice : undefined,
      excludedRanges,
    });

    return { success: true, batchId: batch.id };
  }
}
