import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteClip, updateClip, getClipPlayUrl } from "~/actions/generation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
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

vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    clip: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    uploadedFile: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
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
      vi.mocked(auth).mockResolvedValueOnce(null as any);

      const result = await deleteClip("clip-123");
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(db.clip.findFirst).not.toHaveBeenCalled();
    });

    it("deve retornar erro se o clipe não for encontrado ou não pertencer ao usuário", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: "user-123" },
        expires: "2099-01-01",
      } as any);

      vi.mocked(db.clip.findFirst).mockResolvedValueOnce(null);

      const result = await deleteClip("clip-404");
      expect(result).toEqual({ success: false, error: "Clip not found" });
      expect(db.clip.delete).not.toHaveBeenCalled();
    });

    it("deve excluir o arquivo do S3 e deletar o clipe no Prisma e revalidar /dashboard", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: "user-123" },
        expires: "2099-01-01",
      } as any);

      vi.mocked(db.clip.findFirst).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
        s3Key: "uploads/user-123/clip_1.mp4",
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
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: "user-123" },
        expires: "2099-01-01",
      } as any);

      vi.mocked(db.clip.findFirst).mockRejectedValueOnce(new Error("DB Timeout"));

      const result = await deleteClip("clip-123");
      expect(result).toEqual({ success: false, error: "DB Timeout" });
    });
  });

  describe("updateClip", () => {
    it("deve atualizar preset e transcrição do clipe", async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: "user-123" },
        expires: "2099-01-01",
      } as any);

      vi.mocked(db.clip.findFirst).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
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
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: "user-123" },
        expires: "2099-01-01",
      } as any);

      vi.mocked(db.clip.findFirst).mockResolvedValueOnce({
        id: "clip-123",
        userId: "user-123",
        s3Key: "uploads/clip.mp4",
      } as any);

      const result = await getClipPlayUrl("clip-123");
      expect(result.success).toBe(true);
      expect(result.url).toBe("https://s3.example.com/clip.mp4");
    });
  });
});
