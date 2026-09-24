import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";
import type {
  TriggerVideoProcessingInput,
  TriggerVideoProcessingOutput,
} from "~/application/dtos/video-dtos";

export class TriggerVideoProcessingUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly queueGateway: IQueueGateway
  ) {}

  async execute(
    input: TriggerVideoProcessingInput
  ): Promise<TriggerVideoProcessingOutput> {
    const uploadedVideo = await this.uploadedFileRepository.findById(
      input.uploadedFileId
    );

    if (!uploadedVideo) {
      throw new NotFoundError("Vídeo", input.uploadedFileId);
    }

    if (uploadedVideo.uploaded) {
      return { success: true, triggered: false };
    }

    await this.queueGateway.sendProcessVideoEvent({
      uploadedFileId: uploadedVideo.id,
      userId: uploadedVideo.userId,
      preset: input.preset,
      mode: input.mode,
      manualCuts: input.manualCuts,
    });

    await this.uploadedFileRepository.update(input.uploadedFileId, {
      uploaded: true,
    });

    if (input.manualCuts && input.manualCuts.length > 0) {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      await prisma.uploadedFile.update({
        where: { id: input.uploadedFileId },
        data: { manualCutsJson: JSON.stringify(input.manualCuts) }
      });
    }

    return { success: true, triggered: true };
  }
}
