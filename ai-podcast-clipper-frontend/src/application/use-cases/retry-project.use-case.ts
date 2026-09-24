import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class RetryProjectUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly queueGateway: IQueueGateway
  ) {}

  async execute(input: {
    projectId: string;
    userId: string;
    updates?: {
      subtitlePreset?: string;
      clipModel?: string;
      aspectRatio?: string;
      autoZoom?: boolean;
      sliceStartTime?: number;
      sliceEndTime?: number;
    };
  }): Promise<void> {
    const project = await this.uploadedFileRepository.findById(input.projectId);

    if (!project) {
      throw new NotFoundError("Projeto", input.projectId);
    }

    if (project.userId !== input.userId) {
      throw new UnauthorizedError("tentar reprocessar este projeto");
    }

    // Prepare data to update
    const updateData: any = {
      status: "queued",
      errorMessage: null,
    };

    if (input.updates) {
      if (input.updates.subtitlePreset !== undefined) updateData.subtitlePreset = input.updates.subtitlePreset;
      if (input.updates.clipModel !== undefined) updateData.clipModel = input.updates.clipModel;
      if (input.updates.aspectRatio !== undefined) updateData.aspectRatio = input.updates.aspectRatio;
      if (input.updates.autoZoom !== undefined) updateData.autoZoom = input.updates.autoZoom;
      if (input.updates.sliceStartTime !== undefined) updateData.sliceStartTime = input.updates.sliceStartTime;
      if (input.updates.sliceEndTime !== undefined) updateData.sliceEndTime = input.updates.sliceEndTime;
    }

    // Reset status to queued
    const updatedRaw = await prisma.uploadedFile.update({
      where: { id: input.projectId },
      data: updateData,
    });

    // Delete any clips that might have been partially generated to avoid duplicates
    await prisma.clip.deleteMany({
      where: { uploadedFileId: input.projectId },
    });

    // Send to Inngest again
    await this.queueGateway.sendProcessVideoEvent({
      uploadedFileId: project.id,
      userId: project.userId,
      preset: updatedRaw.subtitlePreset || "HORMOZI",
      mode: updatedRaw.clipModel === "manual" ? "manual" : "auto",
      manualCuts: updatedRaw.manualCutsJson ? JSON.parse(updatedRaw.manualCutsJson as string) : undefined,
    });
  }
}
