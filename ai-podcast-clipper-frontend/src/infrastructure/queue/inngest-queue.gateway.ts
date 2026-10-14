import { inngest } from "~/inngest/client";
import type {
  IQueueGateway,
  ProcessVideoEventPayload,
} from "~/domain/ports/queue-gateway";
import type { AddClipsToProjectEventData } from "~/application/dtos/video-dtos";

export class InngestQueueGateway implements IQueueGateway {
  async sendProcessVideoEvent(
    payload: ProcessVideoEventPayload
  ): Promise<void> {
    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: payload.uploadedFileId,
        userId: payload.userId,
        preset: payload.preset,
        mode: payload.mode,
        manualCuts: payload.manualCuts,
      },
    });
  }

  async sendAddClipsToProjectEvent(
    payload: AddClipsToProjectEventData
  ): Promise<void> {
    await inngest.send({
      // Idempotência por lote: o Inngest descarta eventos repetidos com o
      // mesmo `id` (janela de 24h). Um reenvio deste mesmo `send` (retry de
      // rede) nunca dispara uma 2ª execução do mesmo lote. Defesa
      // complementar ao "claim" atômico do lote em `appendClipsToProjectHandler`.
      id: `append-clips-${payload.batchId}`,
      name: "append-clips-events",
      data: {
        uploadedFileId: payload.uploadedFileId,
        batchId: payload.batchId,
        userId: payload.userId,
        mode: payload.mode,
        manualCuts: payload.manualCuts,
        aiSlice: payload.aiSlice,
        excludedRanges: payload.excludedRanges,
      },
    });
  }
}
