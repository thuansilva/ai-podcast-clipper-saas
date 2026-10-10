import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import type {
  IUploadedFileRepository,
  UpdateUploadedFileInput,
} from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";

export interface RetryProjectInput {
  projectId: string;
  userId: string;
  updates?: Partial<
    Pick<
      UpdateUploadedFileInput,
      | "subtitlePreset"
      | "clipModel"
      | "aspectRatio"
      | "autoZoom"
      | "sliceStartTime"
      | "sliceEndTime"
    >
  >;
}

export class RetryProjectUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly queueGateway: IQueueGateway,
    private readonly clipRepository: IClipRepository
  ) {}

  async execute(input: RetryProjectInput): Promise<void> {
    const project = await this.uploadedFileRepository.findById(input.projectId);

    if (!project) {
      throw new NotFoundError("Projeto", input.projectId);
    }

    if (project.userId !== input.userId) {
      throw new UnauthorizedError("tentar reprocessar este projeto");
    }

    const updateData: UpdateUploadedFileInput = {
      status: "queued",
      errorMessage: null,
      ...(input.updates?.subtitlePreset !== undefined && {
        subtitlePreset: input.updates.subtitlePreset,
      }),
      ...(input.updates?.clipModel !== undefined && {
        clipModel: input.updates.clipModel,
      }),
      ...(input.updates?.aspectRatio !== undefined && {
        aspectRatio: input.updates.aspectRatio,
      }),
      ...(input.updates?.autoZoom !== undefined && {
        autoZoom: input.updates.autoZoom,
      }),
      ...(input.updates?.sliceStartTime !== undefined && {
        sliceStartTime: input.updates.sliceStartTime,
      }),
      ...(input.updates?.sliceEndTime !== undefined && {
        sliceEndTime: input.updates.sliceEndTime,
      }),
    };

    // Reset status to queued
    const updated = await this.uploadedFileRepository.update(
      input.projectId,
      updateData
    );

    // Delete any clips that might have been partially generated to avoid duplicates
    await this.clipRepository.deleteByUploadedFileId(input.projectId);

    // Send to Inngest again
    // D6: `mode` é derivado de `manualCutsJson != null`, nunca de `clipModel`
    // (que só assume valores de LAYOUT: "auto" | "face_focus" — nunca "manual").
    await this.queueGateway.sendProcessVideoEvent({
      uploadedFileId: project.id,
      userId: project.userId,
      preset: updated.subtitlePreset || "HORMOZI",
      mode: updated.manualCutsJson != null ? "manual" : "auto",
      manualCuts: updated.manualCutsJson
        ? JSON.parse(updated.manualCutsJson as string)
        : undefined,
    });
  }
}
