"use server";

import { revalidatePath } from "next/cache";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeImportYouTubeVideoUseCase } from "~/infrastructure/factories/use-case-factories";
import { makeYouTubeImportRateLimiter } from "~/infrastructure/factories/rate-limiter-factory";
import { DomainError } from "~/domain/errors/domain-error";
import { RateLimitExceededError } from "~/domain/errors/rate-limit-exceeded-error";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";

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

  try {
    const allowed = await makeYouTubeImportRateLimiter().consume(userId);
    if (!allowed) {
      throw new RateLimitExceededError(
        "Too many requests. Please wait a minute before importing another video."
      );
    }

    const options = await getProcessingOptions();

    if (input.genre && !options.GENRE?.some((o) => o.value === input.genre)) {
      throw new DomainError("Invalid genre");
    }
    if (
      input.aspectRatio &&
      !options.ASPECT_RATIO?.some((o) => o.value === input.aspectRatio)
    ) {
      throw new DomainError("Invalid aspect ratio");
    }
    if (input.clipModel && !options.CLIP_MODEL?.some((o) => o.value === input.clipModel)) {
      throw new DomainError("Invalid clip model");
    }

    const useCase = makeImportYouTubeVideoUseCase();
    const result = await useCase.execute({
      userId,
      url: input.url,
      preset: input.preset,
      mode: input.mode,
      manualCuts: input.manualCuts,
      sliceStartTime: input.sliceStartTime,
      sliceEndTime: input.sliceEndTime,
      genre: input.genre,
      clipModel: input.clipModel,
      aspectRatio: input.aspectRatio,
      autoZoom: input.autoZoom,
      thumbnailUrl: input.thumbnailUrl,
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
