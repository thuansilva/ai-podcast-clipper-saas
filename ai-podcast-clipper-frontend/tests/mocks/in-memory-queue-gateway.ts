import type {
  IQueueGateway,
  ProcessVideoEventPayload,
} from "~/domain/ports/queue-gateway";
import type { AddClipsToProjectEventData } from "~/application/dtos/video-dtos";

export class InMemoryQueueGateway implements IQueueGateway {
  public sentEvents: ProcessVideoEventPayload[] = [];
  public sentAppendEvents: AddClipsToProjectEventData[] = [];

  async sendProcessVideoEvent(
    payload: ProcessVideoEventPayload
  ): Promise<void> {
    this.sentEvents.push({ ...payload });
  }

  async sendAddClipsToProjectEvent(
    payload: AddClipsToProjectEventData
  ): Promise<void> {
    this.sentAppendEvents.push({ ...payload });
  }
}
