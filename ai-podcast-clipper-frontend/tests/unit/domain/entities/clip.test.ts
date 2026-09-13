import { describe, it, expect } from "vitest";
import { Clip } from "~/domain/entities/clip";
import { DomainError } from "~/domain/errors/domain-error";

describe("Clip Domain Entity", () => {
  const baseClipData = {
    id: "clip-123",
    userId: "user-456",
    uploadedFileId: "file-789",
    s3Key: "clips/user-456/clip-123.mp4",
    title: "Melhor momento do podcast",
    hook: "Você não vai acreditar no que aconteceu!",
    viralityScore: 9,
    reason: "Alto teor dramático e revelação surpreendente",
    startTime: 10,
    endTime: 40,
    durationSeconds: 30,
    subtitlePreset: "HORMOZI" as const,
    layoutMode: "SMART_CROP" as const,
    transcriptWords: [{ word: "você", start: 10, end: 10.5 }],
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
  };

  it("deve reconstituir uma entidade Clip existente do banco via Clip.restore", () => {
    const clip = Clip.restore(baseClipData);

    expect(clip.id).toBe("clip-123");
    expect(clip.userId).toBe("user-456");
    expect(clip.uploadedFileId).toBe("file-789");
    expect(clip.s3Key).toBe("clips/user-456/clip-123.mp4");
    expect(clip.title).toBe("Melhor momento do podcast");
    expect(clip.hook).toBe("Você não vai acreditar no que aconteceu!");
    expect(clip.viralityScore).toBe(9);
    expect(clip.reason).toBe("Alto teor dramático e revelação surpreendente");
    expect(clip.startTime).toBe(10);
    expect(clip.endTime).toBe(40);
    expect(clip.durationSeconds).toBe(30);
    expect(clip.subtitlePreset).toBe("HORMOZI");
    expect(clip.layoutMode).toBe("SMART_CROP");
    expect(clip.transcriptWords).toEqual([{ word: "você", start: 10, end: 10.5 }]);
  });

  it("deve criar um novo clipe via Clip.create e calcular automaticamente durationSeconds", () => {
    const clip = Clip.create({
      id: "clip-1",
      userId: "user-1",
      s3Key: "clips/clip-1.mp4",
      title: "Clip auto duration",
      startTime: 15,
      endTime: 45,
    });

    expect(clip.durationSeconds).toBe(30);
    expect(clip.subtitlePreset).toBe("HORMOZI");
    expect(clip.layoutMode).toBe("SMART_CROP");
  });

  it("deve lançar DomainError se o título for vazio", () => {
    expect(() => {
      Clip.create({
        ...baseClipData,
        title: "   ",
      });
    }).toThrow(DomainError);
  });

  it("deve lançar DomainError se startTime for negativo", () => {
    expect(() => {
      Clip.create({
        ...baseClipData,
        startTime: -5,
      });
    }).toThrow(DomainError);
  });

  it("deve lançar DomainError se endTime for menor ou igual a startTime", () => {
    expect(() => {
      Clip.create({
        ...baseClipData,
        startTime: 30,
        endTime: 30,
      });
    }).toThrow(DomainError);

    expect(() => {
      Clip.create({
        ...baseClipData,
        startTime: 40,
        endTime: 20,
      });
    }).toThrow(DomainError);
  });

  it("deve verificar se o clipe pertence a um determinado usuário (isOwnedBy)", () => {
    const clip = Clip.restore(baseClipData);

    expect(clip.isOwnedBy("user-456")).toBe(true);
    expect(clip.isOwnedBy("outro-user")).toBe(false);
  });

  it("deve identificar corretamente clipe de alta viralidade (isHighVirality)", () => {
    const highViralClip = Clip.restore({
      ...baseClipData,
      viralityScore: 8,
    });
    expect(highViralClip.isHighVirality()).toBe(true);

    const normalClip = Clip.restore({
      ...baseClipData,
      viralityScore: 7.9,
    });
    expect(normalClip.isHighVirality()).toBe(false);

    const nullScoreClip = Clip.restore({
      ...baseClipData,
      viralityScore: null,
    });
    expect(nullScoreClip.isHighVirality()).toBe(false);
  });

  it("deve atualizar metadados (título, preset, transcript) e validar título não vazio", () => {
    const clip = Clip.restore(baseClipData);

    clip.updateMetadata({
      title: "Novo Título Incrível",
      subtitlePreset: "NEON",
      transcriptWords: [{ word: "olá", start: 0, end: 1 }],
    });

    expect(clip.title).toBe("Novo Título Incrível");
    expect(clip.subtitlePreset).toBe("NEON");
    expect(clip.transcriptWords).toEqual([{ word: "olá", start: 0, end: 1 }]);

    expect(() => {
      clip.updateMetadata({ title: "  " });
    }).toThrow(DomainError);
  });

  it("deve serializar com toJSON() mantendo o formato ClipEntity", () => {
    const clip = Clip.restore(baseClipData);
    const json = clip.toJSON();

    expect(json).toEqual({
      id: "clip-123",
      userId: "user-456",
      uploadedFileId: "file-789",
      s3Key: "clips/user-456/clip-123.mp4",
      title: "Melhor momento do podcast",
      hook: "Você não vai acreditar no que aconteceu!",
      viralityScore: 9,
      reason: "Alto teor dramático e revelação surpreendente",
      startTime: 10,
      endTime: 40,
      durationSeconds: 30,
      subtitlePreset: "HORMOZI",
      layoutMode: "SMART_CROP",
      transcriptWords: [{ word: "você", start: 10, end: 10.5 }],
      createdAt: baseClipData.createdAt,
      updatedAt: baseClipData.updatedAt,
    });
  });
});
