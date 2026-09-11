import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type {
  UpdateClipUseCaseInput,
  UpdateClipUseCaseOutput,
} from "~/application/dtos/clip-dtos";

export class UpdateClipUseCase {
  constructor(private readonly clipRepository: IClipRepository) {}

  async execute(input: UpdateClipUseCaseInput): Promise<UpdateClipUseCaseOutput> {
    const clip = await this.clipRepository.findById(input.clipId);
    if (!clip) {
      throw new NotFoundError("Clipe", input.clipId);
    }

    if (clip.userId !== input.userId) {
      throw new UnauthorizedError("Você não tem permissão para editar este clipe.");
    }

    await this.clipRepository.update(input.clipId, {
      title: input.title,
      subtitlePreset: input.subtitlePreset,
      transcriptWords: input.transcriptWords,
    });

    return {
      success: true,
      clipId: input.clipId,
    };
  }
}
