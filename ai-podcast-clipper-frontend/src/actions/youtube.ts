"use server";

import { revalidatePath } from "next/cache";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeImportYouTubeVideoUseCase } from "~/infrastructure/factories/use-case-factories";
import { makeYouTubeImportRateLimiter } from "~/infrastructure/factories/rate-limiter-factory";
import { DomainError } from "~/domain/errors/domain-error";
import { RateLimitExceededError } from "~/domain/errors/rate-limit-exceeded-error";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";
import { importYouTubeVideoSchema } from "~/domain/schemas/import-youtube-video.schema";

export interface ImportYouTubeVideoInput {
  url: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
  sliceStartTime?: number;
  sliceEndTime?: number;
  genre?: string;
  clipModel?: string;
  aspectRatio?: string;
  autoZoom?: boolean;
  thumbnailUrl?: string;
}

export interface ImportYouTubeVideoResult {
  success: boolean;
  uploadedFileId?: string;
  error?: string;
}

/**
 * Server Action para importação de vídeos do YouTube
 * RN-06: Validação, criação de registro com sourceType YOUTUBE e enfileiramento no Inngest
 */
export async function importYouTubeVideo(
  input: ImportYouTubeVideoInput
): Promise<ImportYouTubeVideoResult> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = importYouTubeVideoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    const allowed = await makeYouTubeImportRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before importing another video."
      );
    }

    const options = await getProcessingOptions();

    if (parsed.data.genre && !options.GENRE?.some((o) => o.value === parsed.data.genre)) {
      throw new DomainError("Invalid genre");
    }
    if (
      parsed.data.aspectRatio &&
      !options.ASPECT_RATIO?.some((o) => o.value === parsed.data.aspectRatio)
    ) {
      throw new DomainError("Invalid aspect ratio");
    }
    if (
      parsed.data.clipModel &&
      !options.CLIP_MODEL?.some((o) => o.value === parsed.data.clipModel)
    ) {
      throw new DomainError("Invalid clip model");
    }

    const useCase = makeImportYouTubeVideoUseCase();
    const result = await useCase.execute({
      userId,
      url: parsed.data.url,
      preset: parsed.data.preset,
      mode: parsed.data.mode,
      manualCuts: parsed.data.manualCuts,
      sliceStartTime: parsed.data.sliceStartTime,
      sliceEndTime: parsed.data.sliceEndTime,
      genre: parsed.data.genre,
      clipModel: parsed.data.clipModel,
      aspectRatio: parsed.data.aspectRatio,
      autoZoom: parsed.data.autoZoom,
      thumbnailUrl: parsed.data.thumbnailUrl,
    });

    revalidatePath("/dashboard");

    return {
      success: true,
      uploadedFileId: result.uploadedFileId,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to import YouTube video",
    };
  }
}
