import type {
  UploadedFileEntity,
} from "~/domain/entities/uploaded-file";
import type {
  CreateUploadedFileInput,
  IUploadedFileRepository,
  UpdateUploadedFileInput,
} from "~/domain/ports/uploaded-file-repository";

export class InMemoryUploadedFileRepository implements IUploadedFileRepository {
  public files: Map<string, UploadedFileEntity> = new Map();

  async findById(id: string): Promise<UploadedFileEntity | null> {
    return this.files.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<UploadedFileEntity[]> {
    return Array.from(this.files.values()).filter(
      (file) => file.userId === userId
    );
  }

  async create(input: CreateUploadedFileInput): Promise<UploadedFileEntity> {
    const id = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const file: UploadedFileEntity = {
      id,
      userId: input.userId,
      s3Key: input.s3Key,
      displayName: input.displayName ?? null,
      sourceType: input.sourceType,
      youtubeUrl: input.youtubeUrl ?? null,
      durationSeconds: input.durationSeconds ?? 0,
      creditsCost: input.creditsCost ?? 0,
      uploaded: input.uploaded ?? false,
      status: input.status ?? "queued",
      errorMessage: null,
      sliceStartTime: input.sliceStartTime ?? 0,
      sliceEndTime: input.sliceEndTime ?? 0,
      genre: input.genre ?? null,
      clipModel: input.clipModel ?? null,
      aspectRatio: input.aspectRatio ?? null,
      autoZoom: input.autoZoom ?? null,
      subtitlePreset: input.subtitlePreset ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.files.set(id, file);
    return file;
  }

  async update(
    id: string,
    input: UpdateUploadedFileInput
  ): Promise<UploadedFileEntity> {
    const file = this.files.get(id);
    if (!file) {
      throw new Error(`File ${id} not found`);
    }

    const updated: UploadedFileEntity = {
      ...file,
      ...(input.s3Key !== undefined && { s3Key: input.s3Key }),
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.durationSeconds !== undefined && {
        durationSeconds: input.durationSeconds,
      }),
      ...(input.creditsCost !== undefined && { creditsCost: input.creditsCost }),
      ...(input.uploaded !== undefined && { uploaded: input.uploaded }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.errorMessage !== undefined && {
        errorMessage: input.errorMessage,
      }),
      updatedAt: new Date(),
    };

    this.files.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }
}
