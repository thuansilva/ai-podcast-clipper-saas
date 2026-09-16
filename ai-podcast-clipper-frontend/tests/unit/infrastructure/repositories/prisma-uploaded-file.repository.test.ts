import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaUploadedFileRepository } from "~/infrastructure/database/repositories/prisma-uploaded-file.repository";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("PrismaUploadedFileRepository - findPaginatedByUserId", () => {
  let repository: PrismaUploadedFileRepository;

  beforeEach(() => {
    repository = new PrismaUploadedFileRepository();
    vi.clearAllMocks();
  });

  it("calculates skip and take based on page and limit and returns mapped result", async () => {
    const mockDbFiles = [
      {
        id: "file-1",
        userId: "user-123",
        s3Key: "s3/file1.mp4",
        displayName: "My Video",
        sourceType: "UPLOAD",
        youtubeUrl: null,
        durationSeconds: 120,
        creditsCost: 2,
        uploaded: true,
        status: "processed",
        errorMessage: null,
        sliceStartTime: 0,
        sliceEndTime: 120,
        genre: null,
        clipModel: null,
        aspectRatio: null,
        autoZoom: null,
        subtitlePreset: null,
        createdAt: new Date("2026-03-01T12:00:00Z"),
        updatedAt: new Date("2026-03-01T12:00:00Z"),
        _count: { clips: 4 },
      },
    ];

    vi.mocked(db.uploadedFile.count).mockResolvedValue(15);
    vi.mocked(db.uploadedFile.findMany).mockResolvedValue(mockDbFiles as any);

    const result = await repository.findPaginatedByUserId("user-123", {
      page: 2,
      limit: 10,
    });

    expect(db.uploadedFile.count).toHaveBeenCalledWith({
      where: { userId: "user-123" },
    });

    expect(db.uploadedFile.findMany).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      skip: 10,
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { clips: true },
        },
      },
    });

    expect(result.totalCount).toBe(15);
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "file-1",
      userId: "user-123",
      displayName: "My Video",
      clipsCount: 4,
    });
  });

  it("applies insensitive search filter when search param is provided", async () => {
    vi.mocked(db.uploadedFile.count).mockResolvedValue(1);
    vi.mocked(db.uploadedFile.findMany).mockResolvedValue([]);

    await repository.findPaginatedByUserId("user-123", {
      page: 1,
      limit: 10,
      search: " podcast ",
    });

    const expectedWhere = {
      userId: "user-123",
      displayName: {
        contains: "podcast",
        mode: "insensitive",
      },
    };

    expect(db.uploadedFile.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(db.uploadedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("orders by createdAt asc when sort is 'asc'", async () => {
    vi.mocked(db.uploadedFile.count).mockResolvedValue(0);
    vi.mocked(db.uploadedFile.findMany).mockResolvedValue([]);

    await repository.findPaginatedByUserId("user-123", {
      page: 1,
      limit: 10,
      sort: "asc",
    });

    expect(db.uploadedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("falls back to default page 1 and limit 10 when not specified or invalid", async () => {
    vi.mocked(db.uploadedFile.count).mockResolvedValue(0);
    vi.mocked(db.uploadedFile.findMany).mockResolvedValue([]);

    const result = await repository.findPaginatedByUserId("user-123", {
      page: 0,
      limit: -5,
    });

    expect(db.uploadedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
      })
    );

    expect(result.currentPage).toBe(1);
  });
});
