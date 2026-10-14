import type {
  AddClipsToProjectEventData,
  ManualCutDTO,
  ProcessingMode,
} from "~/application/dtos/video-dtos";

export interface ProcessVideoEventPayload {
  uploadedFileId: string;
  userId: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}

export interface IQueueGateway {
  sendProcessVideoEvent(payload: ProcessVideoEventPayload): Promise<void>;
  /** Evento `"append-clips-events"` — ver `AddClipsToProjectUseCase` e
   * `AddClipsToProjectEventData` para o formato exato. */
  sendAddClipsToProjectEvent(
    payload: AddClipsToProjectEventData
  ): Promise<void>;
}
