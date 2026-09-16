"use server";

import { revalidatePath } from "next/cache";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeImportYouTubeVideoUseCase } from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";
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
  targetDuration?: string;
  aspectRatio?: string;
  layout?: string;
  autoZoom?: boolean;
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
    const options = await getProcessingOptions();

    if (input.genre && !options.GENRE?.some((o) => o.value === input.genre)) {
      throw new DomainError("Invalid genre");
    }
    if (
      input.targetDuration &&
      !options.DURATION?.some((o) => o.value === input.targetDuration)
    ) {
      throw new DomainError("Invalid duration");
    }
    if (
      input.aspectRatio &&
      !options.ASPECT_RATIO?.some((o) => o.value === input.aspectRatio)
    ) {
      throw new DomainError("Invalid aspect ratio");
    }
    if (input.layout && !options.LAYOUT?.some((o) => o.value === input.layout)) {
      throw new DomainError("Invalid layout");
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
      targetDuration: input.targetDuration,
      aspectRatio: input.aspectRatio,
      layout: input.layout,
      autoZoom: input.autoZoom,
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
