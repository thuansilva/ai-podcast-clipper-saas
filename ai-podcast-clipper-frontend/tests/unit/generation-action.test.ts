import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteClip, updateClip, getClipPlayUrl, processVideo } from "~/actions/generation";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";

vi.mock("~/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "mock-key",
    AWS_SECRET_ACCESS_KEY: "mock-secret",
    S3_BUCKET_NAME: "mock-bucket",
  },
}));

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

vi.mock("~/server/db", () => ({
  db: {
    clip: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    uploadedFile: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockSend = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn(function () {
      return {
        send: mockSend,
      };
    }),
    DeleteObjectCommand: vi.fn(function (args) {
      return { ...args, _isDelete: true };
    }),
    GetObjectCommand: vi.fn(function (args) {
      return { ...args, _isGet: true };
    }),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/clip.mp4"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("~/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

describe("Generation Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteClip", () => {
    it("deve retornar erro Unauthorized se usuário não estiver autenticado", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce(null);

      const result = await deleteClip("clip-123");
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(db.clip.findUnique).not.toHaveBeenCalled();
    });

    it("deve retornar erro se o clipe não for encontrado ou não pertencer ao usuário", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

      vi.mocked(db.clip.findUnique).mockResolvedValueOnce(null);

      const result = await deleteClip("clip-404");
      expect(result.success).toBe(false);
      expect(result.error).toContain("não foi encontrado");
      expect(db.clip.delete).not.toHaveBeenCalled();
    });

    it("deve excluir o arquivo do S3 e deletar o clipe no Prisma e revalidar /dashboard", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

      vi.mocked(db.clip.findUnique).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
        s3Key: "uploads/user-123/clip_1.mp4",
        title: "Clip",
        startTime: 0,
        endTime: 30,
        durationSeconds: 30,
        subtitlePreset: "HORMOZI",
        layoutMode: "SMART_CROP",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(db.clip.delete).mockResolvedValueOnce({
        id: "clip-123",
      } as any);

      const result = await deleteClip("clip-123");

      expect(result).toEqual({ success: true });
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: "uploads/user-123/clip_1.mp4",
      });
      expect(db.clip.delete).toHaveBeenCalledWith({
        where: { id: "clip-123" },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("deve capturar falhas e retornar erro", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

      vi.mocked(db.clip.findUnique).mockRejectedValueOnce(new Error("DB Timeout"));

      const result = await deleteClip("clip-123");
      expect(result).toEqual({ success: false, error: "DB Timeout" });
    });
  });

  describe("updateClip", () => {
    it("deve atualizar preset e transcrição do clipe", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

      vi.mocked(db.clip.findUnique).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
        s3Key: "uploads/clip.mp4",
        title: "Clip",
        startTime: 0,
        endTime: 30,
        durationSeconds: 30,
        subtitlePreset: "HORMOZI",
        layoutMode: "SMART_CROP",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(db.clip.update).mockResolvedValueOnce({
        id: "clip-123",
      } as any);

      const updatedWords = [{ word: "Novo", start: 0, end: 0.5 }];
      const result = await updateClip("clip-123", {
        subtitlePreset: "NEON",
        transcriptWords: updatedWords,
      });

      expect(result).toEqual({ success: true });
      expect(db.clip.update).toHaveBeenCalledWith({
        where: { id: "clip-123" },
        data: {
          subtitlePreset: "NEON",
          transcriptWords: updatedWords,
        },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("getClipPlayUrl", () => {
    it("deve gerar URL pré-assinada para clipe do usuário", async () => {
      mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

      vi.mocked(db.clip.findUnique).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
        s3Key: "uploads/clip.mp4",
        title: "Clip",
        startTime: 0,
        endTime: 30,
        durationSeconds: 30,
        subtitlePreset: "HORMOZI",
        layoutMode: "SMART_CROP",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await getClipPlayUrl("clip-123");
      expect(result.success).toBe(true);
      expect(result.url).toBe("https://s3.example.com/clip.mp4");
    });
  });

  describe("processVideo", () => {
    it("não deve disparar evento se o arquivo já estiver marcado como uploaded", async () => {
      vi.mocked(db.uploadedFile.findUniqueOrThrow).mockResolvedValueOnce({
        id: "file-already-uploaded",
        uploaded: true,
        userId: "user-123",
      } as any);

      await processVideo("file-already-uploaded");

      expect(inngest.send).not.toHaveBeenCalled();
      expect(db.uploadedFile.update).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("deve disparar evento no Inngest, atualizar status para uploaded e revalidar /dashboard", async () => {
      vi.mocked(db.uploadedFile.findUniqueOrThrow).mockResolvedValueOnce({
        id: "file-new",
        uploaded: false,
        userId: "user-123",
      } as any);

      vi.mocked(inngest.send).mockResolvedValueOnce({} as any);
      vi.mocked(db.uploadedFile.update).mockResolvedValueOnce({} as any);

      await processVideo("file-new", "HORMOZI");

      expect(inngest.send).toHaveBeenCalledWith({
        name: "process-video-events",
        data: {
          uploadedFileId: "file-new",
          userId: "user-123",
          preset: "HORMOZI",
          mode: undefined,
          manualCuts: undefined,
        },
      });

      expect(db.uploadedFile.update).toHaveBeenCalledWith({
        where: { id: "file-new" },
        data: { uploaded: true },
      });

      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("deve repassar mode e manualCuts para o Inngest quando fornecidos", async () => {
      vi.mocked(db.uploadedFile.findUniqueOrThrow).mockResolvedValueOnce({
        id: "file-manual",
        uploaded: false,
        userId: "user-123",
      } as any);

      vi.mocked(inngest.send).mockResolvedValueOnce({} as any);
      vi.mocked(db.uploadedFile.update).mockResolvedValueOnce({} as any);

      const manualCuts = [
        { id: "cut-1", title: "Corte Manual", startTime: 10, endTime: 40 },
      ];

      await processVideo("file-manual", "HORMOZI", "manual", manualCuts);

      expect(inngest.send).toHaveBeenCalledWith({
        name: "process-video-events",
        data: {
          uploadedFileId: "file-manual",
          userId: "user-123",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts,
        },
      });

      expect(db.uploadedFile.update).toHaveBeenCalledWith({
        where: { id: "file-manual" },
        data: { uploaded: true },
      });

      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });
  });
});

