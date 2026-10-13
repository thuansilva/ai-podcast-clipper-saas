import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IClipRepository } from "~/domain/ports/clip-repository";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import { logger } from "~/lib/observability/logger";

export interface DeleteUserFilesFromStorageInput {
  userId: string;
}

/**
 * Extraído de `DeleteUserAccountUseCase` (ver item "Fluxo de exclusão de
 * conta incompleto" do checklist de go-live) para que a exclusão de conta
 * possa ser executada pelo Inngest (`src/inngest/functions.ts::
 * deleteUserAccount`) em um `step.run` próprio, com retry granular: se a
 * exclusão do storage (S3) falhar e o passo inteiro for repetido, o passo
 * anterior (`cancel-subscription`) e os passos seguintes
 * (`anonymize-user-and-delete-rows`) não são reexecutados.
 *
 * Apaga do storage (S3) apenas os arquivos (`UploadedFile`) e clipes
 * (`Clip`) do usuário — não toca nas linhas do banco nem no cadastro do
 * usuário (isso é responsabilidade de `AnonymizeUserAndDeleteRowsUseCase`).
 *
 * Idempotente: tolera arquivo já ausente no storage (ex.: 404 numa entrega
 * anterior que já tinha apagado o objeto, mas falhou antes de confirmar) —
 * apenas loga um aviso e continua. Se o usuário não tiver arquivos/clipes
 * (ou já tiverem sido todos apagados numa tentativa anterior), é um no-op.
 */
export class DeleteUserFilesFromStorageUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly clipRepository: IClipRepository,
    private readonly storageGateway: IStorageGateway
  ) {}

  async execute(input: DeleteUserFilesFromStorageInput): Promise<void> {
    const [uploadedFiles, clips] = await Promise.all([
      this.uploadedFileRepository.findByUserId(input.userId),
      this.clipRepository.findByUserId(input.userId),
    ]);

    for (const file of uploadedFiles) {
      if (!file.s3Key) continue;
      try {
        await this.storageGateway.deleteFile(file.s3Key);
      } catch (error) {
        // Tolerante a arquivo já não existir no storage (ex.: 404) — não
        // interrompe a exclusão da conta por causa de um objeto órfão.
        logger.warn("Failed to delete uploaded file from storage", {
          s3Key: file.s3Key,
          error,
        });
      }
    }

    for (const clip of clips) {
      if (!clip.s3Key) continue;
      try {
        await this.storageGateway.deleteFile(clip.s3Key);
      } catch (error) {
        logger.warn("Failed to delete clip from storage", {
          s3Key: clip.s3Key,
          error,
        });
      }
    }
  }
}
