"use server";

import { revalidatePath } from "next/cache";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeDeleteClipUseCase,
  makeGetClipPlayUrlUseCase,
  makeUpdateClipUseCase,
  makeTriggerVideoProcessingUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";
import type { SubtitlePreset } from "~/domain/entities/clip";
import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";

export async function processVideo(
  uploadedFileId: string,
  preset?: string,
  mode?: ProcessingMode,
  manualCuts?: ManualCutDTO[],
) {
  const useCase = makeTriggerVideoProcessingUseCase();
  const result = await useCase.execute({
    uploadedFileId,
    preset,
    mode,
    manualCuts,
  });

  if (result.triggered) {
    revalidatePath("/dashboard");
  }
}

export async function getClipPlayUrl(
  clipId: string,
): Promise<{ succes: boolean; success?: boolean; url?: string; error?: string }> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { succes: false, success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeGetClipPlayUrlUseCase();
    const result = await useCase.execute({
      clipId,
      userId,
    });

    return { succes: true, success: true, url: result.url };
  } catch (error) {
    if (error instanceof DomainError) {
      return { succes: false, success: false, error: error.message };
    }
    return {
      succes: false,
      success: false,
      error: "Failed to generate play URL.",
    };
  }
}

export async function deleteClip(
  clipId: string,
): Promise<{ success: boolean; error?: string }> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeDeleteClipUseCase();
    await useCase.execute({
      clipId,
      userId,
    });

    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    if (error instanceof DomainError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete clip",
    };
  }
}

export async function updateClip(
  clipId: string,
  data: {
    title?: string;
    subtitlePreset?: string;
    transcriptWords?: unknown;
  },
): Promise<{ success: boolean; error?: string }> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeUpdateClipUseCase();
    await useCase.execute({
      clipId,
      userId,
      title: data.title,
      subtitlePreset: data.subtitlePreset as SubtitlePreset | undefined,
      transcriptWords: data.transcriptWords,
    });

    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    if (error instanceof DomainError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update clip",
    };
  }
}
