import { describe, it, expect, beforeEach, vi } from "vitest";
import { ListUserVideosUseCase } from "~/application/use-cases/videos/list-user-videos.use-case";
import { InMemoryUploadedFileRepository } from "../../../mocks/in-memory-uploaded-file-repository";

describe("ListUserVideosUseCase", () => {
  let fileRepo: InMemoryUploadedFileRepository;
  let useCase: ListUserVideosUseCase;

  beforeEach(() => {
    fileRepo = new InMemoryUploadedFileRepository();
    useCase = new ListUserVideosUseCase(fileRepo);
  });

  it("deve retornar vídeos paginados com as propriedades mapeadas para UploadedFileDTO", async () => {
    const createdFile = await fileRepo.create({
      userId: "user-1",
      s3Key: "uploads/user-1/uuid/video1.mp4",
      displayName: "Podcast Episodio 1",
      sourceType: "UPLOAD",
      status: "processed",
    });
    fileRepo.setClipsCount(createdFile.id, 4);

    const result = await useCase.execute({ userId: "user-1" });

    expect(result).toEqual({
      data: [
        {
          id: createdFile.id,
          s3Key: "uploads/user-1/uuid/video1.mp4",
          filename: "Podcast Episodio 1",
          status: "processed",
          clipsCount: 4,
          createdAt: createdFile.createdAt,
        },
      ],
      totalCount: 1,
      totalPages: 1,
      currentPage: 1,
    });
  });

  it("deve usar 'Unknown filename' como fallback se displayName for nulo ou indefinido", async () => {
    await fileRepo.create({
      userId: "user-1",
      s3Key: "uploads/user-1/uuid/video2.mp4",
      displayName: null,
      sourceType: "UPLOAD",
    });

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.filename).toBe("Unknown filename");
  });

  it("deve repassar parâmetros de paginação, busca e ordenação para o repositório", async () => {
    const spy = vi.spyOn(fileRepo, "findPaginatedByUserId");

    await useCase.execute({
      userId: "user-123",
      page: 2,
      limit: 15,
      search: "entrevista",
      sort: "asc",
    });

    expect(spy).toHaveBeenCalledWith("user-123", {
      page: 2,
      limit: 15,
      search: "entrevista",
      sort: "asc",
    });
  });

  it("deve retornar lista vazia quando o usuário não possui vídeos cadastrados", async () => {
    const result = await useCase.execute({ userId: "user-no-videos" });

    expect(result.data).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(result.currentPage).toBe(1);
  });
});
