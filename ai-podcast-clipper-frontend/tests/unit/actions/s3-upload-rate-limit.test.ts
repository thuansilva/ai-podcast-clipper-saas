import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateUploadUrl } from "~/actions/s3";
import { makeGenerateUploadUrlUseCase } from "~/infrastructure/factories/use-case-factories";

// Deliberately NOT mocking ~/infrastructure/factories/rate-limiter-factory
// here: this file exercises the real in-memory limiter to prove the action
// actually enforces the limit (item 4 of the security roadmap).

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

describe("generateUploadUrl Server Action - rate limiting", () => {
  const mockExecute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGateway.getUserId.mockResolvedValue("user-rate-limited");
    vi.mocked(makeGenerateUploadUrlUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);
    mockExecute.mockResolvedValue({
      success: true,
      signedUrl: "https://bucket.s3.amazonaws.com/signed",
      uploadedFileId: "file-1",
      s3Key: "uploads/user-rate-limited/uuid/video.mp4",
    });
  });

  const validUpload = {
    filename: "video.mp4",
    contentType: "video/mp4" as const,
    fileSizeBytes: 1000,
  };

  it("permite até 10 uploads por minuto e bloqueia o 11o com RateLimitExceededError", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await generateUploadUrl(validUpload);
      expect(result.success).toBe(true);
    }

    const eleventh = await generateUploadUrl(validUpload);

    expect(eleventh.success).toBe(false);
    expect(eleventh.error).toContain("Too many requests");
    expect(mockExecute).toHaveBeenCalledTimes(10);
  });

  it("não compartilha o limite entre usuários diferentes", async () => {
    for (let i = 0; i < 10; i++) {
      await generateUploadUrl(validUpload);
    }

    mockAuthGateway.getUserId.mockResolvedValue("another-user");
    const result = await generateUploadUrl(validUpload);

    expect(result.success).toBe(true);
  });
});
