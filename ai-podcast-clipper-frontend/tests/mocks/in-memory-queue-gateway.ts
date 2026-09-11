import type {
  IQueueGateway,
  ProcessVideoEventPayload,
} from "~/domain/ports/queue-gateway";

export class InMemoryQueueGateway implements IQueueGateway {
  public sentEvents: ProcessVideoEventPayload[] = [];

  async sendProcessVideoEvent(
    payload: ProcessVideoEventPayload
  ): Promise<void> {
    this.sentEvents.push({ ...payload });
  }
}
