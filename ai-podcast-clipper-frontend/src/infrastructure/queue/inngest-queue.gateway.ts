import { inngest } from "~/inngest/client";
import type {
  IQueueGateway,
  ProcessVideoEventPayload,
} from "~/domain/ports/queue-gateway";

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
}
