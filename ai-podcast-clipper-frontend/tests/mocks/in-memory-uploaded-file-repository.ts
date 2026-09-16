import type {
  UploadedFileEntity,
} from "~/domain/entities/uploaded-file";
import type {
  CreateUploadedFileInput,
  IUploadedFileRepository,
  PaginatedResult,
  PaginationParams,
  UpdateUploadedFileInput,
} from "~/domain/ports/uploaded-file-repository";

export class InMemoryUploadedFileRepository implements IUploadedFileRepository {
  public files: Map<string, UploadedFileEntity> = new Map();
  public clipsCountMap: Map<string, number> = new Map();

  setClipsCount(fileId: string, count: number): void {
    this.clipsCountMap.set(fileId, count);
  }

  async findById(id: string): Promise<UploadedFileEntity | null> {
    return this.files.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<UploadedFileEntity[]> {
    return Array.from(this.files.values()).filter(
      (file) => file.userId === userId
    );
  }

  async findPaginatedByUserId(
    userId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<UploadedFileEntity & { clipsCount: number }>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 10;
    const search = params.search?.trim().toLowerCase();
    const sort = params.sort === "asc" ? "asc" : "desc";

    let userFiles = Array.from(this.files.values()).filter(
      (file) => file.userId === userId
    );

    if (search) {
      userFiles = userFiles.filter((file) =>
        (file.displayName ?? "").toLowerCase().includes(search)
      );
    }

    userFiles.sort((a, b) => {
      const timeA = a.createdAt.getTime();
      const timeB = b.createdAt.getTime();
      return sort === "asc" ? timeA - timeB : timeB - timeA;
    });

    const totalCount = userFiles.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const paginatedFiles = userFiles.slice(startIndex, startIndex + limit);

    return {
      data: paginatedFiles.map((file) => ({
        ...file,
        clipsCount: this.clipsCountMap.get(file.id) ?? 0,
      })),
      totalCount,
      totalPages,
      currentPage: page,
    };
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
    this.clipsCountMap.delete(id);
  }
}

