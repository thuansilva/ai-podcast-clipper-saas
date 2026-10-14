import { db } from "~/server/db";
import type { Prisma } from "@prisma/client";
import type {
  ProjectProcessingBatchEntity,
  ProjectProcessingBatchMode,
  ProjectProcessingBatchStatus,
  CreateProjectProcessingBatchInput,
} from "~/domain/entities/project-processing-batch";
import type {
  IProcessingBatchRepository,
  UpdateProcessingBatchInput,
} from "~/domain/ports/processing-batch-repository";

function toEntity(row: {
  id: string;
  uploadedFileId: string;
  mode: string;
  rangesJson: Prisma.JsonValue;
  excludedRangesJson: Prisma.JsonValue | null;
  s3Key: string | null;
  creditsCost: number;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectProcessingBatchEntity {
  return {
    id: row.id,
    uploadedFileId: row.uploadedFileId,
    mode: row.mode as ProjectProcessingBatchMode,
    rangesJson: row.rangesJson,
    excludedRangesJson: row.excludedRangesJson,
    s3Key: row.s3Key,
    creditsCost: row.creditsCost,
    status: row.status as ProjectProcessingBatchStatus,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCreateData(
  input: CreateProjectProcessingBatchInput
): Prisma.ProjectProcessingBatchUncheckedCreateInput {
  return {
    uploadedFileId: input.uploadedFileId,
    mode: input.mode,
    rangesJson: input.rangesJson as Prisma.InputJsonValue,
    ...(input.excludedRangesJson !== undefined && {
      excludedRangesJson: input.excludedRangesJson as Prisma.InputJsonValue,
    }),
    s3Key: input.s3Key ?? null,
    creditsCost: input.creditsCost ?? 0,
    status: input.status ?? "queued",
  };
}

export class PrismaProcessingBatchRepository
  implements IProcessingBatchRepository
{
  async findById(id: string): Promise<ProjectProcessingBatchEntity | null> {
    const batch = await db.projectProcessingBatch.findUnique({
      where: { id },
    });
    return batch ? toEntity(batch) : null;
  }

  async findByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]> {
    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId },
      orderBy: { createdAt: "desc" },
    });
    return batches.map(toEntity);
  }

  async findActiveByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]> {
    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId, status: { in: ["queued", "processing"] } },
    });
    return batches.map(toEntity);
  }

  async create(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity> {
    const batch = await db.projectProcessingBatch.create({
      data: toCreateData(input),
    });
    return toEntity(batch);
  }

  async createIfNoActive(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity | null> {
    return await db.$transaction(async (tx) => {
      // Serializa criações de lote concorrentes do MESMO projeto: trava a
      // linha do `UploadedFile` (pai) até o fim desta transação. Uma 2ª
      // transação concorrente espera aqui e, ao seguir, já enxerga (READ
      // COMMITTED: snapshot novo por statement) o lote "queued" criado pela
      // 1ª. `FOR NO KEY UPDATE` (e não `FOR UPDATE`) para não bloquear
      // inserts em tabelas filhas (FK checks usam `FOR KEY SHARE`), ex.:
      // `Clip` sendo gravado por outro lote/pipeline em paralelo.
      await tx.$queryRaw`SELECT "id" FROM "UploadedFile" WHERE "id" = ${input.uploadedFileId} FOR NO KEY UPDATE`;

      const activeCount = await tx.projectProcessingBatch.count({
        where: {
          uploadedFileId: input.uploadedFileId,
          status: { in: ["queued", "processing"] },
        },
      });
      if (activeCount > 0) return null;

      const batch = await tx.projectProcessingBatch.create({
        data: toCreateData(input),
      });
      return toEntity(batch);
    });
  }

  async update(
    id: string,
    input: UpdateProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity> {
    const batch = await db.projectProcessingBatch.update({
      where: { id },
      data: {
        ...(input.s3Key !== undefined && { s3Key: input.s3Key }),
        ...(input.creditsCost !== undefined && {
          creditsCost: input.creditsCost,
        }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.errorMessage !== undefined && {
          errorMessage: input.errorMessage,
        }),
      },
    });
    return toEntity(batch);
  }
}
