import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

interface RenameProjectUseCaseInput {
  userId: string;
  projectId: string;
  newName: string;
}

export class RenameProjectUseCase {
  constructor(private uploadedFileRepository: IUploadedFileRepository) {}

  async execute(input: RenameProjectUseCaseInput): Promise<void> {
    const file = await this.uploadedFileRepository.findById(input.projectId);

    if (!file) {
      throw new NotFoundError("Projeto", input.projectId);
    }

    if (file.userId !== input.userId) {
      throw new UnauthorizedError("Você não tem permissão para renomear este projeto.");
    }

    await this.uploadedFileRepository.update(file.id, {
      displayName: input.newName,
    });
  }
}
