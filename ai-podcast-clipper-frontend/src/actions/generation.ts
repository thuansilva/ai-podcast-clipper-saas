"use server";

import { revalidatePath } from "next/cache";
import { inngest } from "~/inngest/client";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  makeDeleteClipUseCase,
  makeGetClipPlayUrlUseCase,
  makeUpdateClipUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";
import type { SubtitlePreset } from "~/domain/entities/clip";

export async function processVideo(uploadedFileId: string, preset?: string) {
  const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
    where: {
      id: uploadedFileId,
    },
    select: {
      uploaded: true,
      id: true,
      userId: true,
    },
  });

  if (uploadedVideo.uploaded) return;

  await inngest.send({
    name: "process-video-events",
    data: {
      uploadedFileId: uploadedVideo.id,
      userId: uploadedVideo.userId,
      preset,
    },
  });

  await db.uploadedFile.update({
    where: {
      id: uploadedFileId,
    },
    data: {
      uploaded: true,
    },
  });

  revalidatePath("/dashboard");
}

export async function getClipPlayUrl(
  clipId: string,
): Promise<{ succes: boolean; success?: boolean; url?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { succes: false, success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeGetClipPlayUrlUseCase();
    const result = await useCase.execute({
      clipId,
      userId: session.user.id,
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
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeDeleteClipUseCase();
    await useCase.execute({
      clipId,
      userId: session.user.id,
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
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const useCase = makeUpdateClipUseCase();
    await useCase.execute({
      clipId,
      userId: session.user.id,
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
