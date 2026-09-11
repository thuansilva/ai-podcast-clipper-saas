"use server";

import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { inngest } from "~/inngest/client";
import { isValidYouTubeUrl, extractYouTubeVideoId } from "~/lib/youtube";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export interface ImportYouTubeVideoInput {
  url: string;
  preset?: string;
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
export async function importYouTubeVideo({
  url,
  preset,
}: ImportYouTubeVideoInput): Promise<ImportYouTubeVideoResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  if (!url || !isValidYouTubeUrl(url)) {
    return { success: false, error: "Invalid YouTube URL" };
  }

  try {
    const videoId = extractYouTubeVideoId(url);
    const uuid = uuidv4();
    const s3Key = `youtube/${uuid}/original.mp4`;
    const displayName = `YouTube Video (${videoId ?? "unknown"})`;

    const uploadedFile = await db.uploadedFile.create({
      data: {
        userId: session.user.id,
        s3Key,
        displayName,
        sourceType: "YOUTUBE",
        youtubeUrl: url,
        uploaded: true,
        status: "queued",
      },
      select: {
        id: true,
      },
    });

    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedFile.id,
        userId: session.user.id,
        preset,
      },
    });

    revalidatePath("/dashboard");

    return {
      success: true,
      uploadedFileId: uploadedFile.id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to import YouTube video",
    };
  }
}
