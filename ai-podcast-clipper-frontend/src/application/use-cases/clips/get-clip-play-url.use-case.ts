import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
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
    const clip = await this.clipRepository.findById(input.clipId);
    if (!clip) {
      throw new NotFoundError("Clipe", input.clipId);
    }

    if (clip.userId !== input.userId) {
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
