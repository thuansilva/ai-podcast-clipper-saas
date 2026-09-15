import { describe, it, expect, beforeEach } from "vitest";
import { TriggerVideoProcessingUseCase } from "~/application/use-cases/videos/trigger-video-processing.use-case";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";
import { InMemoryQueueGateway } from "../../../mocks/in-memory-queue-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";

describe("TriggerVideoProcessingUseCase", () => {
  let uploadedFileRepository: InMemoryUploadedFileRepository;
  let queueGateway: InMemoryQueueGateway;
  let useCase: TriggerVideoProcessingUseCase;

  beforeEach(() => {
    uploadedFileRepository = new InMemoryUploadedFileRepository();
    queueGateway = new InMemoryQueueGateway();
    useCase = new TriggerVideoProcessingUseCase(
      uploadedFileRepository,
      queueGateway
    );
  });

  it("deve lançar NotFoundError se o arquivo não existir", async () => {
    await expect(
      useCase.execute({
        uploadedFileId: "non-existent-file",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("não deve disparar evento se o arquivo já estiver marcado como uploaded", async () => {
    const file = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      uploaded: true,
    });

    const result = await useCase.execute({
      uploadedFileId: file.id,
    });

    expect(result.success).toBe(true);
    expect(result.triggered).toBe(false);
    expect(queueGateway.sentEvents).toHaveLength(0);
  });

  it("deve enviar evento de processamento, marcar como uploaded e retornar sucesso", async () => {
    const file = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      uploaded: false,
    });

    const manualCuts = [
      { id: "cut-1", title: "Corte 1", startTime: 10, endTime: 30 },
    ];

    const result = await useCase.execute({
      uploadedFileId: file.id,
      preset: "HORMOZI",
      mode: "manual",
      manualCuts,
    });

    expect(result.success).toBe(true);
    expect(result.triggered).toBe(true);
    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]).toEqual({
      uploadedFileId: file.id,
      userId: "user-1",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts,
    });

    const updated = await uploadedFileRepository.findById(file.id);
    expect(updated?.uploaded).toBe(true);
  });
});
