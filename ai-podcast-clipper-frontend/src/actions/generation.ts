"use server";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { env } from "~/env";
import { inngest } from "~/inngest/client";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

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
    const clip = await db.clip.findFirst({
      where: {
        id: clipId,
        userId: session.user.id,
      },
    });

    if (!clip) {
      return { succes: false, success: false, error: "Clip not found" };
    }

    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: clip.s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return { succes: true, success: true, url: signedUrl };
  } catch (error) {
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
    const clip = await db.clip.findFirst({
      where: {
        id: clipId,
        userId: session.user.id,
      },
    });

    if (!clip) {
      return { success: false, error: "Clip not found" };
    }

    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: clip.s3Key,
      }),
    );

    await db.clip.delete({
      where: {
        id: clip.id,
      },
    });

    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
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
    const clip = await db.clip.findFirst({
      where: {
        id: clipId,
        userId: session.user.id,
      },
    });

    if (!clip) {
      return { success: false, error: "Clip not found" };
    }

    await db.clip.update({
      where: {
        id: clip.id,
      },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.subtitlePreset !== undefined && {
          subtitlePreset: data.subtitlePreset,
        }),
        ...(data.transcriptWords !== undefined && {
          transcriptWords: data.transcriptWords as Prisma.InputJsonValue,
        }),
      },
    });

    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update clip",
    };
  }
}

