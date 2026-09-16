import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type {
  UploadedFileDTO,
  ListUserVideosInput,
  ListUserVideosOutput,
} from "~/application/dtos/video-dtos";

export type { UploadedFileDTO, ListUserVideosInput, ListUserVideosOutput };

export class ListUserVideosUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository
  ) {}

  async execute(input: ListUserVideosInput): Promise<ListUserVideosOutput> {
    const { userId, page, limit, search, sort } = input;

    const result = await this.uploadedFileRepository.findPaginatedByUserId(
      userId,
      {
        page,
        limit,
        search,
        sort,
      }
    );

    const mappedData: UploadedFileDTO[] = result.data.map((file) => ({
      id: file.id,
      s3Key: file.s3Key,
      filename: file.displayName?.trim() ? file.displayName : "Unknown filename",
      status: file.status,
      clipsCount: file.clipsCount,
      createdAt: file.createdAt,
    }));

    return {
      data: mappedData,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
    };
  }
}
