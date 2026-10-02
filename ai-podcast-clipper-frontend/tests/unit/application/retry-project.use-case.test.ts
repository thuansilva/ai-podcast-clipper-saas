import { describe, it, expect, beforeEach } from "vitest";
import { RetryProjectUseCase } from "~/application/use-cases/retry-project.use-case";
import { InMemoryUploadedFileRepository } from "../../mocks/in-memory-uploaded-file-repository";
import { InMemoryClipRepository } from "../../mocks/in-memory-clip-repository";
import { InMemoryQueueGateway } from "../../mocks/in-memory-queue-gateway";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

describe("RetryProjectUseCase", () => {
  let uploadedFileRepository: InMemoryUploadedFileRepository;
  let clipRepository: InMemoryClipRepository;
  let queueGateway: InMemoryQueueGateway;
  let useCase: RetryProjectUseCase;

  beforeEach(() => {
    uploadedFileRepository = new InMemoryUploadedFileRepository();
    clipRepository = new InMemoryClipRepository();
    queueGateway = new InMemoryQueueGateway();
    useCase = new RetryProjectUseCase(
      uploadedFileRepository,
      queueGateway,
      clipRepository
    );
  });

  it("deve lançar NotFoundError se o projeto não existir", async () => {
    await expect(
      useCase.execute({
        projectId: "non-existent-project",
        userId: "user-1",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("deve lançar UnauthorizedError se o userId não for o dono do projeto (IDOR)", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });

    await expect(
      useCase.execute({
        projectId: project.id,
        userId: "attacker-user",
      })
    ).rejects.toThrow(UnauthorizedError);

    expect(queueGateway.sentEvents).toHaveLength(0);
  });

  it("deve resetar o status para 'queued' e limpar a errorMessage", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });
    await uploadedFileRepository.update(project.id, {
      status: "failed",
      errorMessage: "deu ruim",
    });

    await useCase.execute({ projectId: project.id, userId: "user-1" });

    const updated = await uploadedFileRepository.findById(project.id);
    expect(updated?.status).toBe("queued");
    expect(updated?.errorMessage).toBeNull();
  });

  it("deve aplicar os updates opcionais (subtitlePreset, clipModel, aspectRatio, autoZoom, sliceStartTime, sliceEndTime)", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });

    await useCase.execute({
      projectId: project.id,
      userId: "user-1",
      updates: {
        subtitlePreset: "MRBEAST",
        clipModel: "manual",
        aspectRatio: "9:16",
        autoZoom: true,
        sliceStartTime: 5,
        sliceEndTime: 120,
      },
    });

    const updated = await uploadedFileRepository.findById(project.id);
    expect(updated?.subtitlePreset).toBe("MRBEAST");
    expect(updated?.clipModel).toBe("manual");
    expect(updated?.aspectRatio).toBe("9:16");
    expect(updated?.autoZoom).toBe(true);
    expect(updated?.sliceStartTime).toBe(5);
    expect(updated?.sliceEndTime).toBe(120);
  });

  it("deve deletar os clips antigos do projeto antes de reenfileirar", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });

    await clipRepository.createMany([
      {
        userId: "user-1",
        uploadedFileId: project.id,
        s3Key: "clip-1.mp4",
        title: "Clip 1",
        startTime: 0,
        endTime: 10,
        durationSeconds: 10,
      },
    ]);
    // Clip de outro projeto não deve ser afetado
    await clipRepository.createMany([
      {
        userId: "user-1",
        uploadedFileId: "other-project",
        s3Key: "clip-2.mp4",
        title: "Clip 2",
        startTime: 0,
        endTime: 10,
        durationSeconds: 10,
      },
    ]);

    expect(await clipRepository.findByUploadedFileId(project.id)).toHaveLength(1);

    await useCase.execute({ projectId: project.id, userId: "user-1" });

    expect(await clipRepository.findByUploadedFileId(project.id)).toHaveLength(0);
    expect(await clipRepository.findByUploadedFileId("other-project")).toHaveLength(1);
  });

  it("deve enviar o evento ao queueGateway usando o preset/mode default quando não há updates", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });

    await useCase.execute({ projectId: project.id, userId: "user-1" });

    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]).toEqual({
      uploadedFileId: project.id,
      userId: "user-1",
      preset: "HORMOZI",
      mode: "auto",
      manualCuts: undefined,
    });
  });

  it("deve montar o evento a partir dos updates (preset/mode/manualCuts persistidos)", async () => {
    const project = await uploadedFileRepository.create({
      userId: "user-1",
      s3Key: "test.mp4",
      sourceType: "UPLOAD",
      status: "failed",
    });

    const manualCuts = [{ id: "cut-1", title: "Corte 1", startTime: 10, endTime: 30 }];
    await uploadedFileRepository.update(project.id, {
      manualCutsJson: JSON.stringify(manualCuts),
    });

    await useCase.execute({
      projectId: project.id,
      userId: "user-1",
      updates: {
        subtitlePreset: "MRBEAST",
        clipModel: "manual",
      },
    });

    expect(queueGateway.sentEvents).toHaveLength(1);
    expect(queueGateway.sentEvents[0]).toEqual({
      uploadedFileId: project.id,
      userId: "user-1",
      preset: "MRBEAST",
      mode: "manual",
      manualCuts,
    });
  });
});
