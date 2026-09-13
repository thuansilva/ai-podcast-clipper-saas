import type {
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
}
