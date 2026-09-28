import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = "/tmp/ai-podcast-clipper";

const mockAuthGateway = {
  getUserId: vi.fn().mockResolvedValue("user-123"),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

const mockUploadedFileRepository = { findByS3Key: vi.fn() };
const mockClipRepository = { findByS3Key: vi.fn().mockResolvedValue(null) };

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeUploadedFileRepository: () => mockUploadedFileRepository,
  makeClipRepository: () => mockClipRepository,
}));

// Overrides the real 2GB ceiling with a tiny one so the test can exercise
// the same streaming-abort code path without sending gigabytes of data.
vi.mock("~/domain/schemas/generate-upload-url.schema", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("~/domain/schemas/generate-upload-url.schema")
  >();
  return { ...actual, MAX_VIDEO_UPLOAD_SIZE_BYTES: 10 };
});

describe("local-storage route — limite de tamanho no PUT", () => {
  const testKey = `size-limit-${Date.now()}/video.mp4`;
  const testFilePath = path.join(UPLOAD_DIR, testKey);

  beforeEach(() => {
    mockUploadedFileRepository.findByS3Key.mockResolvedValue({
      id: "file-1",
      userId: "user-123",
      s3Key: testKey,
    });
  });

  afterEach(() => {
    fs.rmSync(testFilePath, { force: true });
  });

  it("rejeita com 413 e apaga o arquivo parcial quando excede o limite", async () => {
    const { PUT } = await import("~/app/api/local-storage/route");

    const oversizedBody = "x".repeat(50); // > limite mockado de 10 bytes
    const url = new URL("http://localhost:3000/api/local-storage");
    url.searchParams.set("key", testKey);
    const req = new Request(url, { method: "PUT", body: oversizedBody });

    const res = await PUT(req as any);

    expect(res.status).toBe(413);
    expect(fs.existsSync(testFilePath)).toBe(false);
  });
});
