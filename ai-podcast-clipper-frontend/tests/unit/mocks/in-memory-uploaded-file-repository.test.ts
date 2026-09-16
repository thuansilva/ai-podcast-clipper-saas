import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUploadedFileRepository } from "../../mocks/in-memory-uploaded-file-repository";

describe("InMemoryUploadedFileRepository - findPaginatedByUserId", () => {
  let repository: InMemoryUploadedFileRepository;

  beforeEach(() => {
    repository = new InMemoryUploadedFileRepository();
  });

  it("returns empty paginated result when user has no files", async () => {
    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
    });

    expect(result).toEqual({
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
    });
  });

  it("filters files by userId only", async () => {
    await repository.create({
      userId: "user-1",
      s3Key: "file1.mp4",
      displayName: "User 1 File",
      sourceType: "UPLOAD",
    });
    await repository.create({
      userId: "user-2",
      s3Key: "file2.mp4",
      displayName: "User 2 File",
      sourceType: "UPLOAD",
    });

    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.displayName).toBe("User 1 File");
  });

  it("paginates files correctly across pages", async () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z").getTime();
    for (let i = 1; i <= 5; i++) {
      const file = await repository.create({
        userId: "user-1",
        s3Key: `file${i}.mp4`,
        displayName: `File ${i}`,
        sourceType: "UPLOAD",
      });
      // Adjust createdAt to guarantee distinct, deterministic timestamps
      file.createdAt = new Date(baseDate + i * 1000);
      repository.files.set(file.id, file);
    }

    const page1 = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 2,
      sort: "asc",
    });

    expect(page1.totalCount).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.currentPage).toBe(1);
    expect(page1.data.map((f) => f.displayName)).toEqual(["File 1", "File 2"]);

    const page2 = await repository.findPaginatedByUserId("user-1", {
      page: 2,
      limit: 2,
      sort: "asc",
    });

    expect(page2.totalCount).toBe(5);
    expect(page2.totalPages).toBe(3);
    expect(page2.currentPage).toBe(2);
    expect(page2.data.map((f) => f.displayName)).toEqual(["File 3", "File 4"]);

    const page3 = await repository.findPaginatedByUserId("user-1", {
      page: 3,
      limit: 2,
      sort: "asc",
    });

    expect(page3.totalCount).toBe(5);
    expect(page3.totalPages).toBe(3);
    expect(page3.currentPage).toBe(3);
    expect(page3.data.map((f) => f.displayName)).toEqual(["File 5"]);
  });

  it("filters files by displayName case-insensitively", async () => {
    await repository.create({
      userId: "user-1",
      s3Key: "podcast.mp4",
      displayName: "Awesome Podcast Episode 10",
      sourceType: "UPLOAD",
    });
    await repository.create({
      userId: "user-1",
      s3Key: "interview.mp4",
      displayName: "Tech Interview with CEO",
      sourceType: "UPLOAD",
    });
    await repository.create({
      userId: "user-1",
      s3Key: "another.mp4",
      displayName: "PODCAST Highlights",
      sourceType: "UPLOAD",
    });

    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
      search: "podcast",
    });

    expect(result.totalCount).toBe(2);
    expect(result.data).toHaveLength(2);
    const names = result.data.map((f) => f.displayName);
    expect(names).toContain("Awesome Podcast Episode 10");
    expect(names).toContain("PODCAST Highlights");
  });

  it("sorts by createdAt desc by default", async () => {
    const file1 = await repository.create({
      userId: "user-1",
      s3Key: "1.mp4",
      displayName: "Older",
      sourceType: "UPLOAD",
    });
    file1.createdAt = new Date("2026-01-01T10:00:00Z");
    repository.files.set(file1.id, file1);

    const file2 = await repository.create({
      userId: "user-1",
      s3Key: "2.mp4",
      displayName: "Newer",
      sourceType: "UPLOAD",
    });
    file2.createdAt = new Date("2026-01-02T10:00:00Z");
    repository.files.set(file2.id, file2);

    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
    });

    expect(result.data[0]?.displayName).toBe("Newer");
    expect(result.data[1]?.displayName).toBe("Older");
  });

  it("sorts by createdAt asc when requested", async () => {
    const file1 = await repository.create({
      userId: "user-1",
      s3Key: "1.mp4",
      displayName: "Older",
      sourceType: "UPLOAD",
    });
    file1.createdAt = new Date("2026-01-01T10:00:00Z");
    repository.files.set(file1.id, file1);

    const file2 = await repository.create({
      userId: "user-1",
      s3Key: "2.mp4",
      displayName: "Newer",
      sourceType: "UPLOAD",
    });
    file2.createdAt = new Date("2026-01-02T10:00:00Z");
    repository.files.set(file2.id, file2);

    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
      sort: "asc",
    });

    expect(result.data[0]?.displayName).toBe("Older");
    expect(result.data[1]?.displayName).toBe("Newer");
  });

  it("includes clipsCount for files from clipsCountMap or defaults to 0", async () => {
    const file1 = await repository.create({
      userId: "user-1",
      s3Key: "1.mp4",
      displayName: "Has Clips",
      sourceType: "UPLOAD",
    });
    const file2 = await repository.create({
      userId: "user-1",
      s3Key: "2.mp4",
      displayName: "No Clips",
      sourceType: "UPLOAD",
    });

    repository.setClipsCount(file1.id, 5);

    const result = await repository.findPaginatedByUserId("user-1", {
      page: 1,
      limit: 10,
    });

    const file1Result = result.data.find((f) => f.id === file1.id);
    const file2Result = result.data.find((f) => f.id === file2.id);

    expect(file1Result?.clipsCount).toBe(5);
    expect(file2Result?.clipsCount).toBe(0);
  });
});
