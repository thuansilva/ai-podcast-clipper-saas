import { v4 as uuidv4 } from "uuid";
import {
  extractYouTubeVideoId,
  isValidYouTubeUrl,
} from "~/domain/rules/youtube-parser";
import { InvalidYouTubeUrlError } from "~/domain/errors/invalid-youtube-url-error";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { IQueueGateway } from "~/domain/ports/queue-gateway";
import type {
  ImportYouTubeVideoInput,
  ImportYouTubeVideoOutput,
} from "~/application/dtos/video-dtos";

export class ImportYouTubeVideoUseCase {
  constructor(
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly queueGateway: IQueueGateway
  ) {}

  async execute(
    input: ImportYouTubeVideoInput
  ): Promise<ImportYouTubeVideoOutput> {
    if (!input.url || !isValidYouTubeUrl(input.url)) {
      throw new InvalidYouTubeUrlError(input.url);
    }

    const videoId = extractYouTubeVideoId(input.url) ?? "unknown";
    const uuid = uuidv4();
    const s3Key = `youtube/${uuid}/original.mp4`;
    const displayName = `YouTube Video (${videoId})`;

    const uploadedFile = await this.uploadedFileRepository.create({
      userId: input.userId,
      s3Key,
      displayName,
      sourceType: "YOUTUBE",
      youtubeUrl: input.url,
      uploaded: true,
      status: "queued",
    });

    await this.queueGateway.sendProcessVideoEvent({
      uploadedFileId: uploadedFile.id,
      userId: input.userId,
      preset: input.preset,
      mode: input.mode,
      manualCuts: input.manualCuts,
    });

    return {
      success: true,
      uploadedFileId: uploadedFile.id,
      s3Key,
      videoId,
    };
  }
}
