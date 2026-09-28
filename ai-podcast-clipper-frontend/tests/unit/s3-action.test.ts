import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateUploadUrl } from "~/actions/s3";
import { makeGenerateUploadUrlUseCase } from "~/infrastructure/factories/use-case-factories";

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeGenerateUploadUrlUseCase: vi.fn(),
}));

// Rate limiting has its own dedicated coverage in
// tests/unit/actions/s3-upload-rate-limit.test.ts. Here we keep it unlimited
// so these business-logic tests don't depend on call order/count.
vi.mock("~/infrastructure/factories/rate-limiter-factory", () => ({
  makeUploadUrlRateLimiter: () => ({
    consume: vi.fn().mockResolvedValue(true),
  }),
}));

describe("generateUploadUrl Server Action", () => {
  const mockExecute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeGenerateUploadUrlUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);
  });

  const validUpload = {
    filename: "video.mp4",
    contentType: "video/mp4" as const,
    fileSizeBytes: 1000,
  };

  it("deve lançar erro se o usuário não estiver autenticado", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce(null);

    await expect(generateUploadUrl(validUpload)).rejects.toThrow("Unauthorized");

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("deve delegar ao use case e retornar a URL assinada em caso de sucesso", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");
    mockExecute.mockResolvedValueOnce({
      success: true,
      signedUrl: "https://bucket.s3.amazonaws.com/signed",
      uploadedFileId: "file-1",
      s3Key: "uploads/user-123/uuid/video.mp4",
    });

    const result = await generateUploadUrl(validUpload);

    expect(result).toEqual({
      success: true,
      signedUrl: "https://bucket.s3.amazonaws.com/signed",
      key: "uploads/user-123/uuid/video.mp4",
      uploadedFileId: "file-1",
    });
    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      filename: "video.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 1000,
      thumbnailUrl: undefined,
    });
  });

  it("deve retornar success:false quando o use case lançar um DomainError", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");
    const { DomainError } = await import("~/domain/errors/domain-error");
    mockExecute.mockRejectedValueOnce(new DomainError("Bucket temporarily unavailable"));

    const result = await generateUploadUrl(validUpload);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Bucket temporarily unavailable");
  });

  it("deve rejeitar contentType que não é vídeo, sem chamar o use case", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await generateUploadUrl({
      filename: "arquivo.exe",
      contentType: "application/x-msdownload",
      fileSizeBytes: 1000,
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("deve rejeitar arquivo acima do limite de tamanho, sem chamar o use case", async () => {
    mockAuthGateway.getUserId.mockResolvedValueOnce("user-123");

    const result = await generateUploadUrl({
      filename: "video.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 3 * 1024 * 1024 * 1024, // 3GB > limite de 2GB
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
