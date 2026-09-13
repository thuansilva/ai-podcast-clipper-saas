import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";
import { Clip } from "~/domain/entities/clip";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type {
  UpdateClipUseCaseInput,
  UpdateClipUseCaseOutput,
} from "~/application/dtos/clip-dtos";

export class UpdateClipUseCase {
  constructor(private readonly clipRepository: IClipRepository) {}

  async execute(input: UpdateClipUseCaseInput): Promise<UpdateClipUseCaseOutput> {
    const clipRecord = await this.clipRepository.findById(input.clipId);
    if (!clipRecord) {
      throw new NotFoundError("Clipe", input.clipId);
    }

    const clip = Clip.restore(clipRecord);

    if (!clip.isOwnedBy(input.userId)) {
      throw new UnauthorizedError("Você não tem permissão para editar este clipe.");
    }

    clip.updateMetadata({
      title: input.title,
      subtitlePreset: input.subtitlePreset,
      transcriptWords: input.transcriptWords,
    });

    await this.clipRepository.update(input.clipId, {
      ...(input.title !== undefined && { title: clip.title }),
      ...(input.subtitlePreset !== undefined && { subtitlePreset: clip.subtitlePreset }),
      ...(input.transcriptWords !== undefined && { transcriptWords: clip.transcriptWords }),
    });

    return {
      success: true,
      clipId: input.clipId,
    };
  }
}
