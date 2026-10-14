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
  makeCancelUserSubscriptionUseCase,
  makeDeleteUserFilesFromStorageUseCase,
  makeAnonymizeUserAndDeleteRowsUseCase,
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
import { buildAppendProcessVideoPayload } from "~/application/services/append-clips-payload.service";
import {
  remapOriginalRangeToOutput,
  remapOutputTimeToOriginal,
} from "~/domain/services/time-range-remap.service";
import { AiSliceRequiredError } from "~/domain/errors/ai-slice-required-error";
import type {
  AddClipsToProjectEventData,
  AiSliceDTO,
  ManualCutDTO,
  ProcessingMode,
  TimeRangeDTO,
} from "~/application/dtos/video-dtos";
import { v4 as uuidv4 } from "uuid";
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
  slice,
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
  /**
   * NEW contract (RF "adicionar mais cortes" — IA sobre um novo slice):
   * absolute-in-original-video `{startTime, endTime}`, mutually exclusive
   * with `manualCuts`. Unlike `manualCuts`/`ManualCut`, has NO 60s duration
   * cap — a slice for the IA to analyze can be several minutes long. The
   * backend (NOT YET implemented at the time this was written — see this
   * feature's handback) must accept a new `slice: {start, end}` field on
   * `DownloadYouTubeRequest` and respond with `remapped_ranges` containing
   * exactly one entry describing where the slice (merged with margin)
   * landed in the output file — the same `remapped_ranges` shape already
   * returned for `manualCuts`.
   */
  slice?: AiSliceDTO;
}): Promise<YouTubeDownloadResult> {
  const endpoint = getYouTubeDownloadEndpoint();


  const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

  const hasManualCuts = Array.isArray(manualCuts) && manualCuts.length > 0;

  // Only `url` + `s3_key` (+ `manual_cuts` OR `slice`, mutually exclusive,
  // when present): the backend contract (DownloadYouTubeRequest) is
  // extra="forbid" (RNF-SEC-18) and the bucket comes from the backend's own
  // config — any other field is a 422.
  const body: {
    url: string;
    s3_key?: string;
    manual_cuts?: ProcessVideoWireManualCut[];
    slice?: TimeRangeDTO;
  } = {
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
  } else if (slice) {
    body.slice = { start: slice.startTime, end: slice.endTime };
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

export interface AppendClipsResult {
  success: boolean;
  uploadedFileId: string;
  batchId: string;
  error?: string;
  /** `true` quando o evento foi ignorado porque o lote já não estava
   * "queued" (evento duplicado/reentregue) — nada foi cobrado nem gravado. */
  skipped?: boolean;
}

/**
 * Pipeline do evento `"append-clips-events"` ("adicionar mais cortes" a um
 * projeto já existente — RF novo, ver `AddClipsToProjectUseCase`). Função
 * DEDICADA, separada de `processVideoHandler`, por 3 motivos:
 *
 * 1. Semântica bem diferente: nunca apaga clipes existentes, nunca altera
 *    `UploadedFile.status`/`creditsCost`/`s3Key` (só o `ProjectProcessingBatch`
 *    do lote) e sempre baixa/processa só o range/slice NOVO, nunca o vídeo
 *    inteiro.
 * 2. Isolamento de risco: misturar essa lógica em `processVideoHandler`
 *    arriscaria regressões no pipeline de primeiro processamento (já teste
 *    extensivamente coberto); separado, cada arquivo evolui sem o outro.
 * 3. Contrato HTTP novo com o backend Python: `/download_youtube` com
 *    `slice` (em vez de `manual_cuts`, para o modo IA) e `/process_video`
 *    com `excluded_ranges` — ambos específicos deste fluxo.
 *
 * NOTA IMPORTANTE para quem for implementar o lado do backend Python: os
 * dois campos novos (`slice` em `DownloadYouTubeRequest` e
 * `excluded_ranges` em `ProcessVideoRequest`) AINDA NÃO existem no backend
 * no momento em que este código foi escrito — ver o relato desta tarefa
 * para o contrato exato esperado.
 */
export async function appendClipsToProjectHandler({
  event,
  step,
}: {
  event: { data: AddClipsToProjectEventData };
  step: PipelineStep;
}): Promise<AppendClipsResult> {
  const { uploadedFileId, batchId, mode } = event.data;
  let heldCredits = 0;
  let resolvedUserId: string | undefined = event.data.userId;

  logger.info("append-clips-to-project pipeline started", {
    uploadedFileId,
    batchId,
  });

  // Idempotência por lote: "reivindica" o lote de forma ATÔMICA
  // (queued -> processing, num único UPDATE condicional) antes de qualquer
  // download/hold de crédito. Um evento duplicado/reentregue para o mesmo
  // lote (replay, `inngest.send` repetido) encontra o lote já em
  // processing/processed/failed e sai sem cobrar nem gravar nada. Fica num
  // step PRÓPRIO (memoizado pelo Inngest): um retry dos steps seguintes
  // nunca re-executa o claim e, portanto, nunca se auto-bloqueia. O
  // `concurrency` da function não basta — ele limita steps simultâneos, não
  // impede 2 runs do mesmo lote de se intercalarem entre steps.
  const claimed = await step.run("claim-batch", async () => {
    const { count } = await db.projectProcessingBatch.updateMany({
      where: { id: batchId, uploadedFileId, status: "queued" },
      data: { status: "processing" },
    });
    return count === 1;
  });

  if (!claimed) {
    logger.warn("append-clips-to-project skipped: batch is not queued (duplicate event?)", {
      uploadedFileId,
      batchId,
    });
    return {
      success: false,
      uploadedFileId,
      batchId,
      skipped: true,
      error: "Batch is not queued (duplicate or replayed event).",
    };
  }

  try {
    const reservation = await withSpan(
      "inngest.step.append.validate-and-reserve-credits",
      { uploadedFileId, batchId },
      () =>
        step.run("validate-and-reserve-credits", async () => {
          const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
            where: { id: uploadedFileId },
          });
          // Confirma que o lote existe (defesa em profundidade — o use case
          // já o cria antes de disparar este evento).
          await db.projectProcessingBatch.findUniqueOrThrow({
            where: { id: batchId },
          });

          if (uploadedFile.sourceType !== "YOUTUBE" || !uploadedFile.youtubeUrl) {
            throw new Error(
              "Append only supports YouTube projects with a youtubeUrl.",
            );
          }

          // RNF-SEC-18: uma chave S3 NOVA por lote — nunca reaproveita a do
          // projeto nem de um lote anterior (evita colisão de
          // `clip_{index}` entre lotes em `compute_clip_output_s3_key`).
          const newS3Key = `youtube/${uuidv4()}/original.mp4`;

          let downloadResult: YouTubeDownloadResult;
          let effectiveDuration: number;
          let holdAmount: number | undefined;

          if (mode === "manual") {
            const manualCuts = event.data.manualCuts ?? [];
            if (manualCuts.length === 0) {
              throw new ManualCutsRequiredError();
            }

            downloadResult = await downloadYouTubeVideo({
              url: uploadedFile.youtubeUrl,
              s3Key: newS3Key,
              manualCuts,
            });

            // RN-PIPE-MANUAL-17 (espelho): nenhum corte pode terminar depois
            // do fim do vídeo ORIGINAL.
            assertManualCutsWithinVideo(manualCuts, downloadResult.duration);

            effectiveDuration = computeEffectiveProcessingDuration({
              isManual: true,
              manualCuts,
              videoDurationSeconds: downloadResult.duration,
            });
            holdAmount = calculateManualCutsCredits(manualCuts);
          } else {
            const aiSlice = event.data.aiSlice;
            if (!aiSlice || aiSlice.endTime <= aiSlice.startTime) {
              throw new AiSliceRequiredError();
            }

            downloadResult = await downloadYouTubeVideo({
              url: uploadedFile.youtubeUrl,
              s3Key: newS3Key,
              slice: aiSlice,
            });

            // Nunca cobra segundos inexistentes: um slice que ultrapassa o
            // fim do vídeo (payload forjado — a UI já limita ao tamanho do
            // vídeo) é cobrado só até a duração real baixada.
            // (Duração desconhecida/0 do backend: sem clamp, comportamento
            // anterior preservado.)
            const billableSliceEnd =
              downloadResult.duration > 0
                ? Math.min(aiSlice.endTime, downloadResult.duration)
                : aiSlice.endTime;
            if (billableSliceEnd <= aiSlice.startTime) {
              throw new AiSliceRequiredError();
            }

            effectiveDuration = computeEffectiveProcessingDuration({
              isManual: false,
              sliceStartTime: aiSlice.startTime,
              sliceEndTime: billableSliceEnd,
              videoDurationSeconds: downloadResult.duration,
            });
            holdAmount = undefined;
          }

          const holdCreditsUseCase = makeHoldCreditsUseCase();
          const holdResult = await holdCreditsUseCase.execute({
            userId: uploadedFile.userId,
            durationSeconds: effectiveDuration,
            fileId: uploadedFileId,
            amount: holdAmount,
            // Nunca sobrescreve `UploadedFile.creditsCost` (projeto) — o
            // custo deste lote é rastreado só em
            // `ProjectProcessingBatch.creditsCost` (step seguinte).
            skipFileStatusUpdate: true,
          });

          return {
            userId: uploadedFile.userId,
            batchS3Key: downloadResult.s3_key,
            creditsCost: holdResult.heldCredits,
            remappedRanges: downloadResult.remappedRanges,
            remappedCuts: downloadResult.remappedCuts,
            subtitlePreset: uploadedFile.subtitlePreset ?? null,
            genre: uploadedFile.genre ?? null,
            aspectRatio: uploadedFile.aspectRatio ?? null,
            autoZoom: uploadedFile.autoZoom ?? null,
          };
        }),
    );

    resolvedUserId = reservation.userId;
    heldCredits = reservation.creditsCost;

    await withSpan(
      "inngest.step.append.mark-batch-processing",
      { uploadedFileId, batchId },
      () =>
        step.run("mark-batch-processing", async () => {
          await db.projectProcessingBatch.update({
            where: { id: batchId },
            data: {
              status: "processing",
              s3Key: reservation.batchS3Key,
              creditsCost: reservation.creditsCost,
            },
          });
        }),
    );

    const modalResult = await withSpan(
      "inngest.step.append.call-modal-gpu",
      { uploadedFileId, batchId, userId: resolvedUserId ?? "" },
      () =>
        step.run("call-modal-gpu", async () => {
          let manualCutsWire: ProcessVideoWireManualCut[] | undefined;
          let excludedRangesWire: TimeRangeDTO[] | undefined;

          if (mode === "manual") {
            const remapped = reservation.remappedCuts;
            if (!remapped || remapped.length === 0) {
              // Nunca cair silenciosamente para os cortes originais: eles
              // apontariam para tempos do vídeo original completo, não do
              // arquivo (menor) deste lote, armazenado em `reservation.batchS3Key`.
              throw new Error(
                "Manual cuts remapping missing for append batch: cannot send pre-download (original) timestamps.",
              );
            }
            manualCutsWire = remapped.map((cut) => ({
              title: cut.title ?? undefined,
              start: cut.new_start,
              end: cut.new_end,
            }));
          } else {
            const excludedRanges = event.data.excludedRanges ?? [];
            if (excludedRanges.length > 0) {
              const mergedRange = reservation.remappedRanges?.[0];
              if (!mergedRange) {
                throw new Error(
                  "Slice remapping missing for append batch: cannot compute excludedRanges in the output file's timeline.",
                );
              }
              excludedRangesWire = excludedRanges.map((range) =>
                remapOriginalRangeToOutput(range, mergedRange),
              );
            }
          }

          const payload = buildAppendProcessVideoPayload({
            video: {
              subtitlePreset: reservation.subtitlePreset,
              genre: reservation.genre,
              aspectRatio: reservation.aspectRatio,
              autoZoom: reservation.autoZoom,
            },
            s3Key: reservation.batchS3Key,
            mode,
            manualCuts: manualCutsWire,
            excludedRanges: excludedRangesWire,
          });

          const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
          const response = await undiciFetch(env.PROCESS_VIDEO_ENDPOINT, {
            method: "POST",
            dispatcher: agent,
            headers: injectTraceHeaders({
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.AUTH_TOKEN}`,
            }),
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Modal GPU processing failed with status ${response.status}: ${errorText || response.statusText}`,
            );
          }

          return (await response.json()) as ModalProcessVideoResponse;
        }),
    );

    await withSpan(
      "inngest.step.append.persist-clips-and-consume",
      { uploadedFileId, batchId, userId: resolvedUserId ?? "" },
      () =>
        step.run("persist-clips-and-consume", async () => {
          const clips = modalResult.clips ?? [];
          const mergedRange = reservation.remappedRanges?.[0];

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
                  clip.words ?? clip.transcriptWords ?? clip.transcript_words ?? null;

                // Tempo no vídeo ORIGINAL (RF "adicionar mais cortes" —
                // nunca inventado: auto remapeia via `remapped_ranges`,
                // manual casa pelo par new_start/new_end já devolvido em
                // `remapped_cuts`).
                let sourceStart: number | null = null;
                let sourceEnd: number | null = null;
                if (mode === "auto" && mergedRange) {
                  sourceStart = remapOutputTimeToOriginal(start, mergedRange);
                  sourceEnd = remapOutputTimeToOriginal(end, mergedRange);
                } else if (mode === "manual" && reservation.remappedCuts) {
                  const matched = reservation.remappedCuts.find(
                    (cut) =>
                      Math.abs(cut.new_start - start) < 0.5 &&
                      Math.abs(cut.new_end - end) < 0.5,
                  );
                  if (matched) {
                    sourceStart = matched.original_start;
                    sourceEnd = matched.original_end;
                  }
                }

                return {
                  s3Key: clip.s3_key ?? clip.s3Key ?? "",
                  title: clip.title ?? "Clip",
                  hook: clip.hook ?? null,
                  viralityScore: score,
                  reason: clip.reason ?? null,
                  startTime: start,
                  endTime: end,
                  sourceStartTime: sourceStart,
                  sourceEndTime: sourceEnd,
                  durationSeconds: dur,
                  subtitlePreset:
                    clip.preset ?? clip.subtitlePreset ?? reservation.subtitlePreset ?? "HORMOZI",
                  layoutMode: clip.layout_mode ?? clip.layoutMode ?? "SMART_CROP",
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

          await db.projectProcessingBatch.update({
            where: { id: batchId },
            data: { status: "processed" },
          });
        }),
    );

    logger.info("append-clips-to-project pipeline completed", {
      uploadedFileId,
      batchId,
      userId: resolvedUserId ?? "",
    });

    return { success: true, uploadedFileId, batchId };
  } catch (error: unknown) {
    const rawErrorMessage =
      error instanceof Error
        ? error.message
        : "Append clips processing failed unexpectedly";
    const friendlyErrorMessage = formatFriendlyErrorMessage(rawErrorMessage);

    logger.error("append-clips-to-project pipeline failed", {
      uploadedFileId,
      batchId,
      userId: resolvedUserId ?? "",
      error,
    });

    const fileUserId = resolvedUserId ?? event.data.userId;

    // Libera só o hold DESTE lote — nunca toca em `UploadedFile` (projeto
    // inteiro continua intacto, clipes de outros lotes nunca são afetados).
    if (heldCredits > 0 && fileUserId) {
      const user = await db.user.findUnique({
        where: { id: fileUserId },
        select: { reservedCredits: true },
      });
      const amountToRefund = Math.min(heldCredits, user?.reservedCredits ?? 0);
      if (amountToRefund > 0) {
        const refundCreditsUseCase = makeRefundCreditsUseCase();
        await refundCreditsUseCase.execute({
          userId: fileUserId,
          amount: amountToRefund,
          fileId: uploadedFileId,
          reason: friendlyErrorMessage,
          // Nunca marca o projeto (`UploadedFile`) como "failed" — só o
          // lote (`ProjectProcessingBatch`, próximo passo) é marcado.
          skipFileStatusUpdate: true,
        });
      }
    }

    await db.projectProcessingBatch.update({
      where: { id: batchId },
      data: { status: "failed", errorMessage: friendlyErrorMessage },
    });

    return {
      success: false,
      uploadedFileId,
      batchId,
      error: friendlyErrorMessage,
    };
  }
}

export const appendClipsToProject = inngest.createFunction(
  {
    id: "append-clips-to-project",
    triggers: [{ event: "append-clips-events" }],
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.uploadedFileId",
    },
    onFailure: async ({ event, error }) => {
      const data = event.data.event?.data as
        | AddClipsToProjectEventData
        | undefined;
      const uploadedFileId = data?.uploadedFileId;
      const batchId = data?.batchId;
      const userId = data?.userId;
      if (!uploadedFileId || !batchId) return;

      const errorMessage =
        error?.message || "Inngest function failed after retries";
      const friendlyMessage = formatFriendlyErrorMessage(errorMessage);

      logger.error("append-clips-to-project exhausted all retries", {
        uploadedFileId,
        batchId,
        userId: userId ?? "",
        error: errorMessage,
      });

      const currentBatch = await db.projectProcessingBatch.findUnique({
        where: { id: batchId },
        select: { creditsCost: true, status: true },
      });

      if (
        !currentBatch ||
        currentBatch.status === "processed" ||
        currentBatch.status === "failed"
      ) {
        return;
      }

      if (userId && currentBatch.creditsCost > 0) {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { reservedCredits: true },
        });
        const amountToRefund = Math.min(
          currentBatch.creditsCost,
          user?.reservedCredits ?? 0,
        );
        if (amountToRefund > 0) {
          const refundCreditsUseCase = makeRefundCreditsUseCase();
          await refundCreditsUseCase.execute({
            userId,
            amount: amountToRefund,
            fileId: uploadedFileId,
            reason: friendlyMessage,
            skipFileStatusUpdate: true,
          });
        }
      }

      await db.projectProcessingBatch.update({
        where: { id: batchId },
        data: { status: "failed", errorMessage: friendlyMessage },
      });
    },
  },
  async ({ event, step }) => {
    return appendClipsToProjectHandler({
      event: event as unknown as { data: AddClipsToProjectEventData },
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

export interface ClerkUserDeletedEventData {
  userId: string;
}

/**
 * Executa a exclusão de conta de um usuário (ver item "Fluxo de exclusão de
 * conta incompleto" do checklist de go-live), disparada pelo webhook
 * `user.deleted` do Clerk (`src/app/api/webhooks/clerk/route.ts`), que só
 * despacha este evento e responde rápido — a limpeza de verdade roda aqui.
 *
 * Decisão de design: em vez de chamar `DeleteUserAccountUseCase.execute()`
 * inteiro dentro de um único `step.run`, cada uma das 3 sub-etapas roda no
 * seu próprio `step.run` nomeado (mesmo padrão de idempotência contra
 * retries já usado em `processStripeWebhook`/`processSubscriptionEvent`),
 * para ganhar retry granular de verdade: se `anonymize-user-and-delete-rows`
 * falhar (ex.: Postgres fora do ar) e o Inngest tentar de novo (dentro do
 * orçamento de `retries: 3`), os passos `cancel-subscription` e
 * `delete-storage-files` — já concluídos com sucesso — não são
 * reexecutados, só o passo que falhou. `retries: 3` (maior que o `1` de
 * `processVideo`) porque esta é uma operação sensível (dados pessoais) mas
 * totalmente idempotente em cada etapa, então vale mais tentativas antes de
 * desistir.
 *
 * `onFailure` só loga (`logger.error`, mesmo padrão de `processVideo`) —
 * não há ação de compensação a fazer (diferente de `processVideo`, que
 * devolve crédito reservado): é o mecanismo de visibilidade para alguém
 * notar, via observabilidade (Grafana/Loki), que uma exclusão de conta não
 * terminou mesmo depois de esgotados os retries.
 */
export const deleteUserAccount = inngest.createFunction(
  {
    id: "delete-user-account",
    triggers: [{ event: "clerk/user.deleted" }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const data = event.data.event?.data as
        | ClerkUserDeletedEventData
        | undefined;
      const userId = data?.userId;

      logger.error("delete-user-account exhausted all retries", {
        userId: userId ?? "",
        error: error?.message || "Inngest function failed after retries",
      });
    },
  },
  async ({ event, step }) => {
    const { userId } = event.data as ClerkUserDeletedEventData;
    const pipelineStep = step as unknown as PipelineStep;

    // Etapa 1/3: cancela a assinatura Stripe ativa (se houver) e expira os
    // créditos de assinatura correspondentes. Também disparado de forma
    // síncrona pela Server Action `requestAccountDeletion`
    // (`src/actions/delete-account.ts`) — chamar de novo aqui é seguro
    // porque `CancelUserSubscriptionUseCase` é idempotente.
    await pipelineStep.run("cancel-subscription", async () => {
      const cancelUserSubscriptionUseCase = makeCancelUserSubscriptionUseCase();
      await cancelUserSubscriptionUseCase.execute({ userId });
    });

    // Etapa 2/3: apaga do S3 os arquivos (`UploadedFile`) e clipes (`Clip`)
    // do usuário. Tolerante a objeto já ausente no storage.
    await pipelineStep.run("delete-storage-files", async () => {
      const deleteUserFilesFromStorageUseCase =
        makeDeleteUserFilesFromStorageUseCase();
      await deleteUserFilesFromStorageUseCase.execute({ userId });
    });

    // Etapa 3/3: remove as linhas de `UploadedFile`/`Clip` e anonimiza o
    // cadastro do `User` (nunca removido do banco — preserva o histórico de
    // auditoria em `CreditTransaction`/`Subscription`), na mesma transação.
    await pipelineStep.run("anonymize-user-and-delete-rows", async () => {
      const anonymizeUserAndDeleteRowsUseCase =
        makeAnonymizeUserAndDeleteRowsUseCase();
      await anonymizeUserAndDeleteRowsUseCase.execute({ userId });
    });
  },
);


