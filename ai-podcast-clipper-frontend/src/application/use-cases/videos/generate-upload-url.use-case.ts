import { v4 as uuidv4 } from "uuid";
import type { IStorageGateway } from "~/domain/ports/storage-gateway";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type {
  GenerateUploadUrlInput,
  GenerateUploadUrlOutput,
} from "~/application/dtos/video-dtos";

export class GenerateUploadUrlUseCase {
  constructor(
    private readonly storageGateway: IStorageGateway,
    private readonly uploadedFileRepository: IUploadedFileRepository
  ) {}

  async execute(
    input: GenerateUploadUrlInput
  ): Promise<GenerateUploadUrlOutput> {
    const uuid = uuidv4();
    const cleanFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `uploads/${input.userId}/${uuid}/${cleanFilename}`;

    const uploadedFile = await this.uploadedFileRepository.create({
      userId: input.userId,
      s3Key,
      displayName: input.filename,
      sourceType: "UPLOAD",
      status: "queued",
      thumbnailUrl: input.thumbnailUrl,
      uploaded: false,
    });

    const signedUrl = await this.storageGateway.createUploadPresignedUrl(
      s3Key,
      input.contentType,
      3600
    );

    return {
      success: true,
      signedUrl,
      uploadedFileId: uploadedFile.id,
      s3Key,
    };
  }
}
