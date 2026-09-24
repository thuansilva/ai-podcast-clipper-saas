import { db } from "~/server/db";
import type {
  SourceType,
  UploadedFileEntity,
  UploadedFileStatus,
} from "~/domain/entities/uploaded-file";
import type {
  CreateUploadedFileInput,
  IUploadedFileRepository,
  PaginatedResult,
  PaginationParams,
  UpdateUploadedFileInput,
} from "~/domain/ports/uploaded-file-repository";

export class PrismaUploadedFileRepository implements IUploadedFileRepository {
  async findById(id: string): Promise<UploadedFileEntity | null> {
    const file = await db.uploadedFile.findUnique({
      where: { id },
    });

    if (!file) return null;

    return {
      id: file.id,
      userId: file.userId,
      s3Key: file.s3Key,
      displayName: file.displayName,
      sourceType: file.sourceType as SourceType,
      youtubeUrl: file.youtubeUrl,
      thumbnailUrl: file.thumbnailUrl,
      durationSeconds: file.durationSeconds,
      creditsCost: file.creditsCost,
      uploaded: file.uploaded,
      status: file.status as UploadedFileStatus,
      errorMessage: file.errorMessage,
      sliceStartTime: file.sliceStartTime,
      sliceEndTime: file.sliceEndTime,
      genre: file.genre,
      clipModel: file.clipModel,
      aspectRatio: file.aspectRatio,
      autoZoom: file.autoZoom,
      subtitlePreset: file.subtitlePreset,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async findByUserId(userId: string): Promise<UploadedFileEntity[]> {
    const files = await db.uploadedFile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return files.map((file) => ({
      id: file.id,
      userId: file.userId,
      s3Key: file.s3Key,
      displayName: file.displayName,
      sourceType: file.sourceType as SourceType,
      youtubeUrl: file.youtubeUrl,
      thumbnailUrl: file.thumbnailUrl,
      durationSeconds: file.durationSeconds,
      creditsCost: file.creditsCost,
      uploaded: file.uploaded,
      status: file.status as UploadedFileStatus,
      errorMessage: file.errorMessage,
      sliceStartTime: file.sliceStartTime,
      sliceEndTime: file.sliceEndTime,
      genre: file.genre,
      clipModel: file.clipModel,
      aspectRatio: file.aspectRatio,
      autoZoom: file.autoZoom,
      subtitlePreset: file.subtitlePreset,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    }));
  }

  async findPaginatedByUserId(
    userId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<UploadedFileEntity & { clipsCount: number }>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 10;
    const skip = (page - 1) * limit;
    const take = limit;
    const search = params.search?.trim();
    const sort = params.sort === "asc" ? "asc" : "desc";

    const where = {
      userId,
      ...(search
        ? {
            displayName: {
              contains: search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [totalCount, files] = await Promise.all([
      db.uploadedFile.count({ where }),
      db.uploadedFile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: sort },
        include: {
          _count: {
            select: { clips: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: files.map((file) => ({
        id: file.id,
        userId: file.userId,
        s3Key: file.s3Key,
        displayName: file.displayName,
        sourceType: file.sourceType as SourceType,
        youtubeUrl: file.youtubeUrl,
      thumbnailUrl: file.thumbnailUrl,
        durationSeconds: file.durationSeconds,
        creditsCost: file.creditsCost,
        uploaded: file.uploaded,
        status: file.status as UploadedFileStatus,
        errorMessage: file.errorMessage,
        sliceStartTime: file.sliceStartTime,
        sliceEndTime: file.sliceEndTime,
        genre: file.genre,
        clipModel: file.clipModel,
        aspectRatio: file.aspectRatio,
        autoZoom: file.autoZoom,
        subtitlePreset: file.subtitlePreset,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        clipsCount: file._count.clips,
      })),
      totalCount,
      totalPages,
      currentPage: page,
    };
  }

  async create(input: CreateUploadedFileInput): Promise<UploadedFileEntity> {
    const file = await db.uploadedFile.create({
      data: {
        userId: input.userId,
        s3Key: input.s3Key,
        displayName: input.displayName,
        sourceType: input.sourceType,
        youtubeUrl: input.youtubeUrl,
        thumbnailUrl: input.thumbnailUrl,
        durationSeconds: input.durationSeconds ?? 0,
        creditsCost: input.creditsCost ?? 0,
        uploaded: input.uploaded ?? false,
        status: input.status ?? "queued",
        sliceStartTime: input.sliceStartTime ?? 0,
        sliceEndTime: input.sliceEndTime ?? 0,
        genre: input.genre,
        clipModel: input.clipModel,
        aspectRatio: input.aspectRatio,
        autoZoom: input.autoZoom,
        subtitlePreset: input.subtitlePreset,
      },
    });

    return {
      id: file.id,
      userId: file.userId,
      s3Key: file.s3Key,
      displayName: file.displayName,
      sourceType: file.sourceType as SourceType,
      youtubeUrl: file.youtubeUrl,
      thumbnailUrl: file.thumbnailUrl,
      durationSeconds: file.durationSeconds,
      creditsCost: file.creditsCost,
      uploaded: file.uploaded,
      status: file.status as UploadedFileStatus,
      errorMessage: file.errorMessage,
      sliceStartTime: file.sliceStartTime,
      sliceEndTime: file.sliceEndTime,
      genre: file.genre,
      clipModel: file.clipModel,
      aspectRatio: file.aspectRatio,
      autoZoom: file.autoZoom,
      subtitlePreset: file.subtitlePreset,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async update(
    id: string,
    input: UpdateUploadedFileInput
  ): Promise<UploadedFileEntity> {
    const file = await db.uploadedFile.update({
      where: { id },
      data: {
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
      },
    });

    return {
      id: file.id,
      userId: file.userId,
      s3Key: file.s3Key,
      displayName: file.displayName,
      sourceType: file.sourceType as SourceType,
      youtubeUrl: file.youtubeUrl,
      thumbnailUrl: file.thumbnailUrl,
      durationSeconds: file.durationSeconds,
      creditsCost: file.creditsCost,
      uploaded: file.uploaded,
      status: file.status as UploadedFileStatus,
      errorMessage: file.errorMessage,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async delete(id: string): Promise<void> {
    await db.uploadedFile.delete({
      where: { id },
    });
  }
}
