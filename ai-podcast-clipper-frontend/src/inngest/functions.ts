import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import {
  makeConsumeCreditsUseCase,
  makeHoldCreditsUseCase,
  makeRefundCreditsUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { Prisma } from "@prisma/client";

export interface ProcessVideoEventData {
  uploadedFileId: string;
  userId?: string;
  preset?: string;
}

export interface ModalClipPayload {
  s3_key?: string;
  s3Key?: string;
  title?: string;
  hook?: string;
  virality_score?: number;
  viralityScore?: number;
  reason?: string;
  start?: number;
  startTime?: number;
  end?: number;
  endTime?: number;
  duration?: number;
  preset?: string;
  subtitlePreset?: string;
  layout_mode?: string;
  layoutMode?: string;
  words?: unknown;
  transcriptWords?: unknown;
  transcript_words?: unknown;
}

export interface ModalProcessVideoResponse {
  success?: boolean;
  file_id?: string;
  clips?: ModalClipPayload[];
}

export interface YouTubeDownloadResult {
  s3_key: string;
  title: string;
  duration: number;
  thumbnail?: string | null;
}

export function getYouTubeDownloadEndpoint(): string {
  if (env.YOUTUBE_DOWNLOAD_ENDPOINT) {
    return env.YOUTUBE_DOWNLOAD_ENDPOINT;
  }
  if (process.env.YOUTUBE_DOWNLOAD_ENDPOINT) {
    return process.env.YOUTUBE_DOWNLOAD_ENDPOINT;
  }
  return env.PROCESS_VIDEO_ENDPOINT.replace(/process[-_]?video/i, "download_youtube");
}

export async function downloadYouTubeVideo({
  url,
  s3Key,
}: {
  url: string;
  s3Key?: string;
}): Promise<YouTubeDownloadResult> {
  const endpoint = getYouTubeDownloadEndpoint();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
    },
    body: JSON.stringify({
      url,
      s3_bucket: env.S3_BUCKET_NAME,
      s3_key: s3Key,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `YouTube download failed with HTTP ${response.status}: ${errorText || response.statusText}`,
    );
  }

  const result = (await response.json()) as {
    success?: boolean;
    s3_key: string;
    title: string;
    duration: number;
    thumbnail?: string | null;
  };

  return {
    s3_key: result.s3_key,
    title: result.title,
    duration: result.duration,
    thumbnail: result.thumbnail,
  };
}

export function formatFriendlyErrorMessage(errorMsg: string): string {
  const lower = errorMsg.toLowerCase();
  if (lower.includes("insufficient credits") || lower.includes("saldo insuficiente")) {
    return errorMsg;
  }
  if (
    lower.includes("modal gpu") ||
    lower.includes("processing failed") ||
    lower.includes("cuda")
  ) {
    return errorMsg;
  }
  if (
    lower.includes("youtube") ||
    lower.includes("unavailable") ||
    lower.includes("restricted")
  ) {
    return errorMsg;
  }
  return errorMsg || "Video processing failed. Please try again later.";
}

export interface PipelineStep {
  run: (name: string, fn: () => any) => Promise<any>;
}

export async function processVideoHandler({
  event,
  step,
}: {
  event: { data: ProcessVideoEventData };
  step: PipelineStep;
}) {
  const { uploadedFileId, preset } = event.data;
  let heldCredits = 0;
  let resolvedUserId = event.data.userId;

  try {
    // Step 1: validate-and-reserve-credits
    const reservation = (await step.run(
      "validate-and-reserve-credits",
      async () => {
        const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
          where: { id: uploadedFileId },
        });

        let currentS3Key = uploadedFile.s3Key;
        let durationSeconds = uploadedFile.durationSeconds;

        if (uploadedFile.sourceType === "YOUTUBE" && uploadedFile.youtubeUrl) {
          const downloadResult = await downloadYouTubeVideo({
            url: uploadedFile.youtubeUrl,
            s3Key: currentS3Key,
          });

          currentS3Key = downloadResult.s3_key;
          durationSeconds = downloadResult.duration;

          await db.uploadedFile.update({
            where: { id: uploadedFileId },
            data: {
              s3Key: currentS3Key,
              durationSeconds: durationSeconds,
              displayName: downloadResult.title || uploadedFile.displayName,
            },
          });
        }

        const holdCreditsUseCase = makeHoldCreditsUseCase();
        const holdResult = await holdCreditsUseCase.execute({
          userId: uploadedFile.userId,
          durationSeconds,
          fileId: uploadedFile.id,
        });

        return {
          userId: uploadedFile.userId,
          s3Key: currentS3Key,
          creditsCost: holdResult.heldCredits,
        };
      },
    )) as {
      userId: string;
      s3Key: string;
      creditsCost: number;
    };

    resolvedUserId = reservation.userId;
    heldCredits = reservation.creditsCost;

    // Step 2: mark-processing
    await step.run("mark-processing", async () => {
      await db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: {
          status: "processing",
        },
      });
    });

    // Step 3: call-modal-gpu
    const modalResult = (await step.run("call-modal-gpu", async () => {
      const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
        },
        body: JSON.stringify({
          s3_key: reservation.s3Key,
          preset: preset ?? "HORMOZI",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Modal GPU processing failed with status ${response.status}: ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as ModalProcessVideoResponse;
      return data;
    })) as ModalProcessVideoResponse;

    // Step 4: persist-clips-and-consume
    await step.run("persist-clips-and-consume", async () => {
      const clips = modalResult.clips ?? [];

      if (clips.length > 0) {
        await db.clip.createMany({
          data: clips.map((clip) => {
            const start = clip.start ?? clip.startTime ?? 0;
            const end = clip.end ?? clip.endTime ?? 0;
            const dur = clip.duration ?? (end > start ? end - start : 0);
            const score =
              typeof clip.virality_score === "number"
                ? clip.virality_score
                : typeof clip.viralityScore === "number"
                  ? clip.viralityScore
                  : null;
            const words =
              clip.words ??
              clip.transcriptWords ??
              clip.transcript_words ??
              null;

            return {
              s3Key: clip.s3_key ?? clip.s3Key ?? "",
              title: clip.title ?? "Clip",
              hook: clip.hook ?? null,
              viralityScore: score,
              reason: clip.reason ?? null,
              startTime: start,
              endTime: end,
              durationSeconds: dur,
              subtitlePreset:
                clip.preset ?? clip.subtitlePreset ?? preset ?? "HORMOZI",
              layoutMode:
                clip.layout_mode ?? clip.layoutMode ?? "SMART_CROP",
              transcriptWords: (words ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              uploadedFileId,
              userId: resolvedUserId!,
            };
          }),
        });
      }

      const consumeCreditsUseCase = makeConsumeCreditsUseCase();
      await consumeCreditsUseCase.execute({
        userId: resolvedUserId!,
        amount: heldCredits,
        fileId: uploadedFileId,
      });

      await db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: {
          status: "processed",
        },
      });
    });

    return { success: true, uploadedFileId };
  } catch (error: unknown) {
    const rawErrorMessage =
      error instanceof Error
        ? error.message
        : "Video processing failed unexpectedly";

    const friendlyErrorMessage = formatFriendlyErrorMessage(rawErrorMessage);

    const currentFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { userId: true, creditsCost: true, status: true },
    });

    if (currentFile?.status === "processed") {
      return { success: false, uploadedFileId, error: friendlyErrorMessage };
    }

    const fileUserId = currentFile?.userId || resolvedUserId;
    if (!fileUserId) {
      return { success: false, uploadedFileId, error: friendlyErrorMessage };
    }

    const user = await db.user.findUnique({
      where: { id: fileUserId },
      select: { reservedCredits: true },
    });

    const amountToRefund = Math.min(
      heldCredits > 0 ? heldCredits : (currentFile?.creditsCost ?? 0),
      user?.reservedCredits ?? 0,
    );

    if (amountToRefund > 0) {
      const refundCreditsUseCase = makeRefundCreditsUseCase();
      await refundCreditsUseCase.execute({
        userId: fileUserId,
        amount: amountToRefund,
        fileId: uploadedFileId,
        reason: friendlyErrorMessage,
      });
    } else {
      const isInsufficient =
        rawErrorMessage.toLowerCase().includes("insufficient credits") ||
        rawErrorMessage.toLowerCase().includes("saldo insuficiente");

      await db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: {
          status: isInsufficient ? "no credits" : "failed",
          errorMessage: friendlyErrorMessage,
        },
      });
    }

    return { success: false, uploadedFileId, error: friendlyErrorMessage };
  }
}

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
    onFailure: async ({ event, error }) => {
      const data = event.data.event?.data as ProcessVideoEventData | undefined;
      const uploadedFileId = data?.uploadedFileId;
      const userId = data?.userId;
      if (!uploadedFileId) return;

      const errorMessage =
        error?.message || "Inngest function failed after retries";
      const friendlyMessage = formatFriendlyErrorMessage(errorMessage);

      const currentFile = await db.uploadedFile.findUnique({
        where: { id: uploadedFileId },
        select: { creditsCost: true, status: true, userId: true },
      });

      if (!currentFile || currentFile.status === "processed" || currentFile.status === "failed") {
        return;
      }

      const fileUserId = currentFile.userId || userId;
      if (!fileUserId) return;

      const user = await db.user.findUnique({
        where: { id: fileUserId },
        select: { reservedCredits: true },
      });

      const amountToRefund = Math.min(
        currentFile.creditsCost,
        user?.reservedCredits ?? 0,
      );

      if (amountToRefund > 0) {
        const refundCreditsUseCase = makeRefundCreditsUseCase();
        await refundCreditsUseCase.execute({
          userId: fileUserId,
          amount: amountToRefund,
          fileId: uploadedFileId,
          reason: friendlyMessage,
        });
      } else {
        const isInsufficient =
          errorMessage.toLowerCase().includes("insufficient credits") ||
          errorMessage.toLowerCase().includes("saldo insuficiente");
        await db.uploadedFile.update({
          where: { id: uploadedFileId },
          data: {
            status: isInsufficient ? "no credits" : "failed",
            errorMessage: friendlyMessage,
          },
        });
      }
    },
  },
  { event: "process-video-events" },
  async ({ event, step }) => {
    return processVideoHandler({
      event: event as { data: ProcessVideoEventData },
      step,
    });
  },
);
