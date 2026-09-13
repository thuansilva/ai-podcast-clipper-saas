import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { Clip } from "~/domain/entities/clip";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import type {
  DeleteClipUseCaseInput,
  DeleteClipUseCaseOutput,
} from "~/application/dtos/clip-dtos";

export class DeleteClipUseCase {
  constructor(
    private readonly clipRepository: IClipRepository,
    private readonly storageGateway: IStorageGateway
  ) {}

  async execute(input: DeleteClipUseCaseInput): Promise<DeleteClipUseCaseOutput> {
    const clipRecord = await this.clipRepository.findById(input.clipId);
    if (!clipRecord) {
      throw new NotFoundError("Clipe", input.clipId);
    }

    const clip = Clip.restore(clipRecord);

    if (!clip.isOwnedBy(input.userId)) {
      throw new UnauthorizedError("Você não tem permissão para excluir este clipe.");
    }

    await this.storageGateway.deleteObject(clip.s3Key);
    await this.clipRepository.delete(input.clipId);

    return {
      success: true,
      clipId: input.clipId,
    };
  }
}
