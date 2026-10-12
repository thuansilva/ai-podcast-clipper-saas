import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import {
  makeAddCreditsFromStripeWebhookUseCase,
  makeConsumeCreditsUseCase,
  makeHoldCreditsUseCase,
  makeRefundCreditsUseCase,
  makeProcessSubscriptionRenewalUseCase,
  makeExpireSubscriptionUseCase,
  makeProcessSubscriptionCheckoutUseCase,
  makeSuspendExpiredPastDueSubscriptionsUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { PrismaSubscriptionRepository } from "~/infrastructure/database/repositories/prisma-subscription.repository";
import { Prisma } from "@prisma/client";
import { calculateManualCutsCredits } from "~/domain/services/credit-pricing.service";
import { validateVideoDuration } from "~/domain/services/plan-policy.service";
import { ManualCutsRequiredError } from "~/domain/errors/manual-cuts-required-error";
import { ManualCutsModeMismatchError } from "~/domain/errors/manual-cuts-mode-mismatch-error";
import {
  assertManualCutsWithinVideo,
  computeEffectiveProcessingDuration,
} from "~/domain/services/processing-duration.service";
import {
  buildProcessVideoPayload,
  type ProcessVideoWireManualCut,
} from "~/application/services/process-video-payload.service";
import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";
import { fetch as undiciFetch, Agent } from "undici";
import { logger } from "~/lib/observability/logger";
import { withSpan, injectTraceHeaders } from "~/lib/observability/tracer";

export interface ProcessVideoEventData {
  uploadedFileId: string;
  userId?: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
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

// Mirrors `RemappedTimeRange`/`RemappedManualCut` in the backend
// (ai-podcast-clipper-backend/core/schemas.py). Only present on
// `DownloadYouTubeResponse` when the request sent `manual_cuts`.
export interface YouTubeRemappedTimeRange {
  original_start: number;
  original_end: number;
  offset_in_output: number;
}

export interface YouTubeRemappedManualCut {
  original_start: number;
  original_end: number;
  new_start: number;
  new_end: number;
  title?: string | null;
}

export interface YouTubeDownloadResult {
  s3_key: string;
  title: string;
  duration: number;
  thumbnail?: string | null;
  /** Present only when the request sent `manualCuts` (RF-INGEST-10). */
  remappedRanges?: YouTubeRemappedTimeRange[];
  /** Present only when the request sent `manualCuts` (RF-INGEST-10). */
  remappedCuts?: YouTubeRemappedManualCut[];
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
  manualCuts,
}: {
  url: string;
  s3Key?: string;
  /**
   * Absolute-in-original-video timestamps (RF-INGEST-10). When present and
   * non-empty, the backend downloads only the range(s) covering these cuts
   * (merged, with margin) instead of the whole video, and the response
   * includes `remapped_ranges`/`remapped_cuts`. Omitted entirely from the
   * request body when absent/empty — the backend contract is
   * `extra="forbid"` (RNF-SEC-18), so this field must never be sent for the
   * automatic mode.
   */
  manualCuts?: ManualCutDTO[];
}): Promise<YouTubeDownloadResult> {
  const endpoint = getYouTubeDownloadEndpoint();


  const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

  const hasManualCuts = Array.isArray(manualCuts) && manualCuts.length > 0;

  // Only `url` + `s3_key` (+ `manual_cuts` when present): the backend
  // contract (DownloadYouTubeRequest) is extra="forbid" (RNF-SEC-18) and the
  // bucket comes from the backend's own config — any other field is a 422.
  const body: { url: string; s3_key?: string; manual_cuts?: ProcessVideoWireManualCut[] } = {
    url,
    s3_key: s3Key,
  };
  if (hasManualCuts) {
    // Wire format matches `core/schemas.py::ManualCut` (`start`/`end`, not
    // `startTime`/`endTime`) — same shape as `ProcessVideoRequest.manual_cuts`.
    body.manual_cuts = manualCuts.map((cut) => ({
      title: cut.title,
      start: cut.startTime,
      end: cut.endTime,
    }));
  }

  const response = await undiciFetch(endpoint, {
    method: "POST",
    dispatcher: agent,
    headers: injectTraceHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AUTH_TOKEN}`,
    }),
    body: JSON.stringify(body),
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
    remapped_ranges?: YouTubeRemappedTimeRange[] | null;
    remapped_cuts?: YouTubeRemappedManualCut[] | null;
  };

  return {
    s3_key: result.s3_key,
    title: result.title,
    duration: result.duration,
    thumbnail: result.thumbnail,
    remappedRanges: result.remapped_ranges ?? undefined,
    remappedCuts: result.remapped_cuts ?? undefined,
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
  return errorMsg ?? "Video processing failed. Please try again later.";
}

export interface PipelineStep {
  run: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
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

  logger.info("process-video pipeline started", { uploadedFileId });

  try {
    // Step 1: validate-and-reserve-credits
    const reservation = await withSpan(
      "inngest.step.validate-and-reserve-credits",
      { uploadedFileId },
      () => step.run(
      "validate-and-reserve-credits",
      async () => {
        const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
          where: { id: uploadedFileId },
          include: { user: true },
        });

        let currentS3Key = uploadedFile.s3Key;
        let durationSeconds = uploadedFile.durationSeconds;
        // RF-INGEST-10: cortes remapeados (tempos no vídeo concatenado
        // menor que de fato ficou em `currentS3Key`), só preenchido quando
        // o download do YouTube recebeu `manualCuts` e devolveu
        // `remapped_cuts`. Consumido pelo step `call-modal-gpu` abaixo —
        // nunca os tempos originais, que não combinam com esse vídeo menor.
        let remappedManualCuts: YouTubeRemappedManualCut[] | undefined;

        const hasManualCuts =
          Array.isArray(event.data.manualCuts) && event.data.manualCuts.length > 0;

        if (uploadedFile.sourceType === "YOUTUBE" && uploadedFile.youtubeUrl) {
          const downloadResult = await downloadYouTubeVideo({
            url: uploadedFile.youtubeUrl,
            s3Key: currentS3Key,
            manualCuts: hasManualCuts ? event.data.manualCuts : undefined,
          });

          currentS3Key = downloadResult.s3_key;
          durationSeconds = downloadResult.duration;
          remappedManualCuts = downloadResult.remappedCuts;

          await db.uploadedFile.update({
            where: { id: uploadedFileId },
            data: {
              s3Key: currentS3Key,
              durationSeconds: durationSeconds,
              displayName: downloadResult.title || uploadedFile.displayName,
            },
          });
        }

        // RN-PIPE-MANUAL-02 / D5: mode="manual" sem cortes é erro, nunca cai
        // para o cálculo automático de créditos (fallback silencioso).
        if (event.data.mode === "manual" && !hasManualCuts) {
          throw new ManualCutsRequiredError();
        }

        // RN-PIPE-MANUAL-03 (espelho do backend): o payload do GPU deriva
        // `mode` da presença de cortes (D6); sem este guard, cortes com mode
        // omitido/"auto" seriam cobrados pelo preço automático mas
        // processados em modo manual (até 50 clipes).
        if (event.data.mode !== "manual" && hasManualCuts) {
          throw new ManualCutsModeMismatchError();
        }

        const isManual = event.data.mode === "manual" && hasManualCuts;

        // RN-PIPE-MANUAL-17: corte além do fim do vídeo falha antes do hold.
        if (isManual) {
          assertManualCutsWithinVideo(event.data.manualCuts!, durationSeconds);
        }

        // No modo manual o limite do plano vale para a soma dos cortes.
        const effectiveDuration = computeEffectiveProcessingDuration({
          isManual,
          manualCuts: event.data.manualCuts,
          sliceStartTime: uploadedFile.sliceStartTime,
          sliceEndTime: uploadedFile.sliceEndTime,
          videoDurationSeconds: durationSeconds,
        });

        const durationValidation = validateVideoDuration(
          effectiveDuration,
          uploadedFile.user?.plan
        );
        if (!durationValidation.valid) {
          throw new Error(durationValidation.error);
        }

        const holdCreditsUseCase = makeHoldCreditsUseCase();
        const holdResult = await holdCreditsUseCase.execute({
          userId: uploadedFile.userId,
          durationSeconds: effectiveDuration,
          fileId: uploadedFile.id,
          amount: isManual
            ? calculateManualCutsCredits(event.data.manualCuts!)
            : undefined,
        });

        return {
          userId: uploadedFile.userId,
          s3Key: currentS3Key,
          creditsCost: holdResult.heldCredits,
          // RF-INGEST-10: só quando o download do YouTube efetivamente
          // remapeou cortes (download parcial no modo manual).
          remappedManualCuts:
            remappedManualCuts && remappedManualCuts.length > 0
              ? remappedManualCuts
              : undefined,
        };
      },
    ));

    resolvedUserId = reservation.userId;
    heldCredits = reservation.creditsCost;

    // Step 2: mark-processing
    await withSpan(
      "inngest.step.mark-processing",
      { uploadedFileId, userId: resolvedUserId ?? "" },
      () => step.run("mark-processing", async () => {
      await db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: {
          status: "processing",
        },
      });
      })
    );

    // Step 3: call-modal-gpu
    const modalResult = await withSpan(
      "inngest.step.call-modal-gpu",
      { uploadedFileId, userId: resolvedUserId ?? "" },
      () => step.run("call-modal-gpu", async () => {
      const video = await db.uploadedFile.findUniqueOrThrow({
        where: { id: uploadedFileId },
      });

      const hasOriginalManualCuts =
        Array.isArray(event.data.manualCuts) && event.data.manualCuts.length > 0;

      // RF-INGEST-10: para vídeos do YouTube com cortes manuais, o arquivo
      // que de fato ficou em `video.s3Key` é o vídeo concatenado MENOR
      // devolvido pelo download parcial — os tempos ORIGINAIS de
      // `event.data.manualCuts` não combinam com ele. Troca-se por
      // `reservation.remappedManualCuts` (tempos já convertidos pelo
      // backend em `/download_youtube`), preservando `id`/`title`
      // originais na mesma ordem. Uploads diretos nunca passam por esse
      // remapeamento (não há download/concat) — usam os cortes originais
      // como sempre.
      let effectiveEventData: ProcessVideoEventData = event.data;

      if (hasOriginalManualCuts && video.sourceType === "YOUTUBE") {
        const remapped = reservation.remappedManualCuts;
        if (!remapped || remapped.length === 0) {
          // Nunca cair silenciosamente para os cortes originais: eles
          // apontariam para tempos do vídeo original completo, não do
          // vídeo (menor) de verdade armazenado em `video.s3Key`.
          throw new Error(
            "Manual cuts remapping missing for YouTube video: cannot send pre-download (original) timestamps to the smaller, already-downloaded video.",
          );
        }
        effectiveEventData = {
          ...event.data,
          manualCuts: remapped.map((cut, index) => ({
            id: event.data.manualCuts?.[index]?.id,
            title: event.data.manualCuts?.[index]?.title,
            startTime: cut.new_start,
            endTime: cut.new_end,
          })),
        };
      }


      const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

      const response = await undiciFetch(env.PROCESS_VIDEO_ENDPOINT, {
        method: "POST",
        dispatcher: agent,
        headers: injectTraceHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AUTH_TOKEN}`,
        }),
        body: JSON.stringify(
          buildProcessVideoPayload({ video, eventData: effectiveEventData }),
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Modal GPU processing failed with status ${response.status}: ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as ModalProcessVideoResponse;
      return data;
      })
    );

    // Step 4: persist-clips-and-consume
    await withSpan(
      "inngest.step.persist-clips-and-consume",
      { uploadedFileId, userId: resolvedUserId ?? "" },
      () => step.run("persist-clips-and-consume", async () => {
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
              transcriptWords: words ?? Prisma.JsonNull,
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
        heldAmount: heldCredits,
        fileId: uploadedFileId,
      });

      await db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: {
          status: "processed",
        },
      });
      })
    );

    logger.info("process-video pipeline completed", {
      uploadedFileId,
      userId: resolvedUserId ?? "",
    });

    return { success: true, uploadedFileId };
  } catch (error: unknown) {
    const rawErrorMessage =
      error instanceof Error
        ? error.message
        : "Video processing failed unexpectedly";

    const friendlyErrorMessage = formatFriendlyErrorMessage(rawErrorMessage);

    logger.error("process-video pipeline failed", {
      uploadedFileId,
      userId: resolvedUserId ?? "",
      error,
    });

    const currentFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { userId: true, creditsCost: true, status: true },
    });

    if (currentFile?.status === "processed") {
      return { success: false, uploadedFileId, error: friendlyErrorMessage };
    }

    const fileUserId = currentFile?.userId ?? resolvedUserId;
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
    triggers: [{ event: "process-video-events" }],
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

      logger.error("process-video exhausted all retries", {
        uploadedFileId,
        userId: userId ?? "",
        error: errorMessage,
      });

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
  async ({ event, step }) => {
    return processVideoHandler({
      event: event as unknown as { data: ProcessVideoEventData },
      step: step as unknown as PipelineStep,
    });
  },
);

export interface StripeCheckoutCompletedEventData {
  customerId: string;
  priceId: string;
}

export const processStripeWebhook = inngest.createFunction(
  {
    id: "process-stripe-webhook",
    triggers: [{ event: "stripe/checkout.completed" }],
    retries: 3,
    concurrency: {
      limit: 10,
    },
  },
  async ({ event, step }) => {
    const data = event.data as StripeCheckoutCompletedEventData;
    // Idempotência contra retries do Inngest (RNF, item HIGH do checklist
    // de go-live): sem `step.run`, um retry (dentro do orçamento de
    // `retries: 3`) reexecuta a função inteira, incluindo o use case que já
    // tinha rodado com sucesso, duplicando a linha em `CreditTransaction`.
    // `step.run` faz o Inngest memoizar o resultado deste passo, então um
    // retry após ele já ter concluído não o chama de novo.
    await (step as unknown as PipelineStep).run(
      "add-credits-from-stripe-checkout",
      async () => {
        const useCase = makeAddCreditsFromStripeWebhookUseCase();
        await useCase.execute({
          stripeCustomerId: data.customerId,
          priceId: data.priceId,
        });
      },
    );
  },
);

export interface StripeSubscriptionEventData {
  eventType?: string;
  customerId: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | number | Date;
  currentPeriodEnd?: string | number | Date;
  billingReason?: string;
}

/**
 * NOTA: `invoice.payment_failed`, `charge.refunded` e `charge.dispute.created`
 * NÃO são tratados aqui de propósito. A política de negócio exige reagir
 * imediatamente a esses 3 eventos (marcar `past_due`/revogar créditos no
 * mesmo instante em que o webhook chega — ver `AGENTS.md`), então
 * `ProcessPaymentFailedUseCase`/`ProcessChargeRefundUseCase`/
 * `ProcessChargeDisputeUseCase` são chamados SINCRONAMENTE dentro de
 * `src/app/api/webhooks/stripe/route.ts`, não por este worker assíncrono.
 * Adicionar um `case` para eles aqui faria essas mutações (em especial a
 * revogação de créditos) rodarem EM DOBRO em produção — a rota só envia a
 * notificação `"stripe/billing-event.recorded"` (ver
 * `notifyStripeBillingEvent`) para auditoria, e nenhuma função deve
 * reagir a ela repetindo a regra de negócio.
 */
export const processSubscriptionEvent = inngest.createFunction(
  {
    id: "process-subscription-event",
    triggers: [
      { event: "stripe/subscription.event" },
      { event: "stripe/invoice.payment_succeeded" },
      { event: "stripe/customer.subscription.updated" },
      { event: "stripe/customer.subscription.deleted" },
    ],
    retries: 3,
    concurrency: {
      limit: 10,
    },
  },
  async ({ event, step }) => {
    const data = event.data as StripeSubscriptionEventData;
    const eventType = data.eventType ?? event.name.replace("stripe/", "");
    const pipelineStep = step as unknown as PipelineStep;

    // Idempotência contra retries do Inngest (RNF, item HIGH do checklist
    // de go-live): cada branch roda dentro do seu próprio `step.run`
    // nomeado (não um `step.run` genérico envolvendo o if/else todo, que
    // teria nome ambíguo nos logs do Inngest). Sem isso, um retry (dentro
    // do orçamento de `retries: 3`) reexecuta a função inteira, incluindo o
    // use case que já tinha rodado com sucesso, duplicando a linha em
    // `CreditTransaction` — `step.run` faz o Inngest memoizar o resultado
    // do passo já concluído, então o retry não o chama de novo.
    if (eventType === "checkout.session.completed") {
      if (data.subscriptionId && data.priceId) {
        const subscriptionId = data.subscriptionId;
        const priceId = data.priceId;
        await pipelineStep.run("apply-subscription-checkout", async () => {
          const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();
          await checkoutUseCase.execute({
            stripeCustomerId: data.customerId,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: priceId,
            currentPeriodStart: data.currentPeriodStart
              ? new Date(data.currentPeriodStart)
              : undefined,
            currentPeriodEnd: data.currentPeriodEnd
              ? new Date(data.currentPeriodEnd)
              : undefined,
          });
        });
      }
    } else if (eventType === "invoice.payment_succeeded") {
      if (data.billingReason !== "subscription_create") {
        await pipelineStep.run("apply-subscription-renewal", async () => {
          const renewalUseCase = makeProcessSubscriptionRenewalUseCase();
          await renewalUseCase.execute({
            stripeCustomerId: data.customerId,
            stripeSubscriptionId: data.subscriptionId,
            currentPeriodStart: data.currentPeriodStart
              ? new Date(data.currentPeriodStart)
              : undefined,
            currentPeriodEnd: data.currentPeriodEnd
              ? new Date(data.currentPeriodEnd)
              : undefined,
          });
        });
      }
    } else if (eventType === "customer.subscription.deleted") {
      await pipelineStep.run("expire-subscription", async () => {
        const expireUseCase = makeExpireSubscriptionUseCase();
        await expireUseCase.execute({
          stripeCustomerId: data.customerId,
          stripeSubscriptionId: data.subscriptionId,
        });
      });
    } else if (eventType === "customer.subscription.updated") {
      if (data.subscriptionId) {
        await pipelineStep.run("update-subscription-status", async () => {
          const subRepo = new PrismaSubscriptionRepository();
          await subRepo.update(data.subscriptionId!, {
            ...(data.status && { status: data.status }),
            ...(data.cancelAtPeriodEnd !== undefined && {
              cancelAtPeriodEnd: data.cancelAtPeriodEnd,
            }),
          });
        });
      }
    }
  },
);

/**
 * Cron agendado: verifica periodicamente assinaturas "past_due" cuja
 * carência (3 dias desde `invoice.payment_failed`, ver
 * `SuspendExpiredPastDueSubscriptionsUseCase`) já expirou sem resolução
 * (`invoice.payment_succeeded`) e suspende o acesso (revoga créditos,
 * cancela a assinatura). Roda a cada hora — reagir em até ~1h após o fim
 * da carência é suficiente para esta política de negócio e evita
 * depender exclusivamente do dunning assíncrono do próprio Stripe.
 */
export const suspendExpiredPastDueSubscriptions = inngest.createFunction(
  {
    id: "suspend-expired-past-due-subscriptions",
    triggers: [{ cron: "0 * * * *" }],
    retries: 1,
  },
  async () => {
    const useCase = makeSuspendExpiredPastDueSubscriptionsUseCase();
    return useCase.execute();
  },
);


