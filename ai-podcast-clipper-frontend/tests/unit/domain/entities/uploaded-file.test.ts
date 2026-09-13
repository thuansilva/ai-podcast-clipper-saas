import { describe, it, expect } from "vitest";
import { UploadedFile } from "~/domain/entities/uploaded-file";
import { DomainError } from "~/domain/errors/domain-error";

describe("UploadedFile Rich Domain Entity", () => {
  it("deve criar um novo arquivo com valores padrão válidos via UploadedFile.create", () => {
    const file = UploadedFile.create({
      id: "file-1",
      userId: "user-1",
      s3Key: "uploads/file-1/video.mp4",
      displayName: "podcast.mp4",
      sourceType: "UPLOAD",
      durationSeconds: 120,
      creditsCost: 2,
    });

    expect(file.id).toBe("file-1");
    expect(file.status).toBe("queued");
    expect(file.isProcessing()).toBe(false);
    expect(file.isProcessed()).toBe(false);
    expect(file.isFailed()).toBe(false);
    expect(file.durationSeconds).toBe(120);
    expect(file.creditsCost).toBe(2);
  });

  it("deve reconstituir um arquivo existente do banco via UploadedFile.restore", () => {
    const now = new Date();
    const file = UploadedFile.restore({
      id: "file-1",
      userId: "user-1",
      s3Key: "uploads/file-1/video.mp4",
      displayName: "podcast.mp4",
      sourceType: "UPLOAD",
      youtubeUrl: null,
      durationSeconds: 120,
      creditsCost: 2,
      uploaded: true,
      status: "processed",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    expect(file.id).toBe("file-1");
    expect(file.status).toBe("processed");
    expect(file.isProcessed()).toBe(true);
  });

  it("deve lançar DomainError se id, userId ou s3Key forem vazios", () => {
    expect(() =>
      UploadedFile.create({
        id: "",
        userId: "user-1",
        s3Key: "s3/key",
      })
    ).toThrow(DomainError);

    expect(() =>
      UploadedFile.create({
        id: "file-1",
        userId: "   ",
        s3Key: "s3/key",
      })
    ).toThrow(DomainError);

    expect(() =>
      UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "",
      })
    ).toThrow(DomainError);
  });

  describe("Máquina de Estados de Status", () => {
    it("deve transicionar de queued para processing", () => {
      const file = UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "uploads/file-1/video.mp4",
      });

      file.markProcessing();
      expect(file.status).toBe("processing");
      expect(file.isProcessing()).toBe(true);
    });

    it("deve transicionar de processing para processed", () => {
      const file = UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "uploads/file-1/video.mp4",
      });

      file.markProcessing();
      file.markProcessed();

      expect(file.status).toBe("processed");
      expect(file.isProcessed()).toBe(true);
    });

    it("não deve permitir transicionar para processing se já estiver processed", () => {
      const file = UploadedFile.restore({
        id: "file-1",
        userId: "user-1",
        s3Key: "uploads/file-1/video.mp4",
        sourceType: "UPLOAD",
        durationSeconds: 60,
        creditsCost: 1,
        uploaded: true,
        status: "processed",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(() => file.markProcessing()).toThrow(DomainError);
    });

    it("deve transicionar para failed com mensagem de erro", () => {
      const file = UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "uploads/file-1/video.mp4",
      });

      file.markFailed("GPU timeout after 15 min");

      expect(file.status).toBe("failed");
      expect(file.errorMessage).toBe("GPU timeout after 15 min");
      expect(file.isFailed()).toBe(true);
    });

    it("deve transicionar para no credits com mensagem", () => {
      const file = UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "uploads/file-1/video.mp4",
      });

      file.markNoCredits("Saldo insuficiente");

      expect(file.status).toBe("no credits");
      expect(file.errorMessage).toBe("Saldo insuficiente");
    });
  });

  describe("Atualização de Duração e Origem", () => {
    it("deve atualizar a duração e o custo de créditos", () => {
      const file = UploadedFile.create({
        id: "file-1",
        userId: "user-1",
        s3Key: "youtube/orig.mp4",
        sourceType: "YOUTUBE",
      });

      file.updateDurationAndSource(300, "youtube/downloaded.mp4", "Novo Título");

      expect(file.durationSeconds).toBe(300);
      expect(file.s3Key).toBe("youtube/downloaded.mp4");
      expect(file.displayName).toBe("Novo Título");
      expect(file.calculateRequiredCredits()).toBe(5); // 300s / 60 = 5 créditos
    });
  });

  describe("Serialização toJSON", () => {
    it("deve retornar o objeto puro UploadedFileEntity", () => {
      const now = new Date();
      const file = UploadedFile.restore({
        id: "file-1",
        userId: "user-1",
        s3Key: "s3/key",
        displayName: "nome.mp4",
        sourceType: "UPLOAD",
        youtubeUrl: null,
        durationSeconds: 60,
        creditsCost: 1,
        uploaded: true,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      });

      expect(file.toJSON()).toEqual({
        id: "file-1",
        userId: "user-1",
        s3Key: "s3/key",
        displayName: "nome.mp4",
        sourceType: "UPLOAD",
        youtubeUrl: null,
        durationSeconds: 60,
        creditsCost: 1,
        uploaded: true,
        status: "queued",
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
});
