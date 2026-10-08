import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { PrismaClipRepository } from "~/infrastructure/database/repositories/prisma-clip.repository";
import type { CreateClipInput } from "~/domain/ports/clip-repository";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    clip: {
      createMany: vi.fn(),
    },
  },
}));

/**
 * Testes de caracterização de `PrismaClipRepository.createMany`, em especial
 * o cast `(clip.transcriptWords ?? Prisma.JsonNull)` que decide se a coluna
 * JSON recebe o array de palavras ou o sentinela `Prisma.JsonNull`.
 */
describe("PrismaClipRepository - createMany", () => {
  let repository: PrismaClipRepository;

  beforeEach(() => {
    repository = new PrismaClipRepository();
    vi.clearAllMocks();
    vi.mocked(db.clip.createMany).mockResolvedValue({ count: 1 });
  });

  it("deve persistir transcriptWords como recebido quando o clip possui palavras", async () => {
    const words: Array<{ word: string; start: number; end: number }> = [
      { word: "Olá", start: 0, end: 0.4 },
      { word: "mundo", start: 0.5, end: 0.9 },
    ];
    const clip: CreateClipInput = {
      userId: "user-1",
      uploadedFileId: "file-1",
      s3Key: "clips/clip-1.mp4",
      title: "Clip 1",
      startTime: 0,
      endTime: 30,
      durationSeconds: 30,
      transcriptWords: words,
    };

    const count = await repository.createMany([clip]);

    expect(count).toBe(1);
    const call = vi.mocked(db.clip.createMany).mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(call.data[0]!.transcriptWords).toEqual(words);
  });

  it("deve usar Prisma.JsonNull quando transcriptWords está ausente (undefined)", async () => {
    const clip: CreateClipInput = {
      userId: "user-1",
      s3Key: "clips/clip-2.mp4",
      title: "Clip 2",
      startTime: 0,
      endTime: 20,
      durationSeconds: 20,
    };

    await repository.createMany([clip]);

    const call = vi.mocked(db.clip.createMany).mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(call.data[0]!.transcriptWords).toBe(Prisma.JsonNull);
  });

  it("deve usar Prisma.JsonNull quando transcriptWords é null explícito", async () => {
    const clip: CreateClipInput = {
      userId: "user-1",
      s3Key: "clips/clip-3.mp4",
      title: "Clip 3",
      startTime: 5,
      endTime: 15,
      durationSeconds: 10,
      transcriptWords: null,
    };

    await repository.createMany([clip]);

    const call = vi.mocked(db.clip.createMany).mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(call.data[0]!.transcriptWords).toBe(Prisma.JsonNull);
  });

  it("deve aplicar defaults HORMOZI e SMART_CROP quando preset e layout não são informados", async () => {
    const clip: CreateClipInput = {
      userId: "user-1",
      s3Key: "clips/clip-4.mp4",
      title: "Clip 4",
      startTime: 0,
      endTime: 10,
      durationSeconds: 10,
    };

    await repository.createMany([clip]);

    const call = vi.mocked(db.clip.createMany).mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(call.data[0]!.subtitlePreset).toBe("HORMOZI");
    expect(call.data[0]!.layoutMode).toBe("SMART_CROP");
  });

  it("deve retornar 0 e não lançar quando a lista de clips está vazia", async () => {
    vi.mocked(db.clip.createMany).mockResolvedValue({ count: 0 });

    const count = await repository.createMany([]);

    expect(count).toBe(0);
    const call = vi.mocked(db.clip.createMany).mock.calls[0]![0] as {
      data: unknown[];
    };
    expect(call.data).toEqual([]);
  });
});
