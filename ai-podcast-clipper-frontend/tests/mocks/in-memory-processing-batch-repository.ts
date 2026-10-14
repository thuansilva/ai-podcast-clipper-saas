import type {
  CreateProjectProcessingBatchInput,
  ProjectProcessingBatchEntity,
} from "~/domain/entities/project-processing-batch";
import type {
  IProcessingBatchRepository,
  UpdateProcessingBatchInput,
} from "~/domain/ports/processing-batch-repository";

export class InMemoryProcessingBatchRepository
  implements IProcessingBatchRepository
{
  public batches: Map<string, ProjectProcessingBatchEntity> = new Map();
  private sequence = 0;

  async findById(id: string): Promise<ProjectProcessingBatchEntity | null> {
    return this.batches.get(id) ?? null;
  }

  async findByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]> {
    return Array.from(this.batches.values()).filter(
      (batch) => batch.uploadedFileId === uploadedFileId
    );
  }

  async findActiveByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]> {
    return Array.from(this.batches.values()).filter(
      (batch) =>
        batch.uploadedFileId === uploadedFileId &&
        (batch.status === "queued" || batch.status === "processing")
    );
  }

  async create(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity> {
    const id = `batch_${++this.sequence}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const batch: ProjectProcessingBatchEntity = {
      id,
      uploadedFileId: input.uploadedFileId,
      mode: input.mode,
      rangesJson: input.rangesJson,
      excludedRangesJson: input.excludedRangesJson ?? null,
      s3Key: input.s3Key ?? null,
      creditsCost: input.creditsCost ?? 0,
      status: input.status ?? "queued",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.batches.set(id, batch);
    return batch;
  }

  async createIfNoActive(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity | null> {
    // Checagem + criação síncronas (sem `await` entre elas): atômico no
    // event loop, mesmo contrato do lock de linha do Prisma.
    const hasActive = Array.from(this.batches.values()).some(
      (batch) =>
        batch.uploadedFileId === input.uploadedFileId &&
        (batch.status === "queued" || batch.status === "processing")
    );
    if (hasActive) return null;
    return this.create(input);
  }

  async update(
    id: string,
    input: UpdateProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity> {
    const batch = this.batches.get(id);
    if (!batch) {
      throw new Error(`Batch ${id} not found`);
    }
    const updated: ProjectProcessingBatchEntity = {
      ...batch,
      ...(input.s3Key !== undefined && { s3Key: input.s3Key }),
      ...(input.creditsCost !== undefined && {
        creditsCost: input.creditsCost,
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.errorMessage !== undefined && {
        errorMessage: input.errorMessage,
      }),
      updatedAt: new Date(),
    };
    this.batches.set(id, updated);
    return updated;
  }
}
