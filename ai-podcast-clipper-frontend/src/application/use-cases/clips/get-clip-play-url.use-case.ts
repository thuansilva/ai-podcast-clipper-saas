import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { Clip } from "~/domain/entities/clip";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import type {
  GetClipPlayUrlInput,
  GetClipPlayUrlOutput,
} from "~/application/dtos/clip-dtos";

export class GetClipPlayUrlUseCase {
  constructor(
    private readonly clipRepository: IClipRepository,
    private readonly storageGateway: IStorageGateway
  ) {}

  async execute(input: GetClipPlayUrlInput): Promise<GetClipPlayUrlOutput> {
    const clipRecord = await this.clipRepository.findById(input.clipId);
    if (!clipRecord) {
      throw new NotFoundError("Clipe", input.clipId);
    }

    const clip = Clip.restore(clipRecord);

    if (!clip.isOwnedBy(input.userId)) {
      throw new UnauthorizedError("Você não tem permissão para acessar este clipe.");
    }

    const url = await this.storageGateway.createPlayPresignedUrl(
      clip.s3Key,
      3600
    );

    return {
      success: true,
      url,
    };
  }
}
