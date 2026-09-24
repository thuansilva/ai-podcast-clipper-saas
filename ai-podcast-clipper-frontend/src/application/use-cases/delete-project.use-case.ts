import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

interface DeleteProjectUseCaseInput {
  userId: string;
  projectId: string;
}

export class DeleteProjectUseCase {
  constructor(
    private uploadedFileRepository: IUploadedFileRepository,
    private clipRepository: IClipRepository,
    private storageGateway: IStorageGateway
  ) {}

  async execute(input: DeleteProjectUseCaseInput): Promise<void> {
    const file = await this.uploadedFileRepository.findById(input.projectId);

    if (!file) {
      throw new NotFoundError("Projeto", input.projectId);
    }

    if (file.userId !== input.userId) {
      throw new UnauthorizedError("Você não tem permissão para excluir este projeto.");
    }

    const clips = await this.clipRepository.findByUploadedFileId(file.id);

    // Delete the original file from storage
    if (file.s3Key) {
      await this.storageGateway.deleteFile(file.s3Key);
    }

    // Delete all clips from storage
    for (const clip of clips) {
      if (clip.s3Key) {
        await this.storageGateway.deleteFile(clip.s3Key);
      }
    }

    // Delete the project (database cascades or handles clips deletion, assuming Prisma setup or we delete manually, 
    // but the task says "Finally, calls repository.delete(projectId)")
    await this.uploadedFileRepository.delete(file.id);
  }
}
