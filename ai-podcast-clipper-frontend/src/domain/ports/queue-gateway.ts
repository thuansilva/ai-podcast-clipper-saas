export interface ProcessVideoEventPayload {
  uploadedFileId: string;
  userId: string;
  preset?: string;
}

export interface IQueueGateway {
  sendProcessVideoEvent(payload: ProcessVideoEventPayload): Promise<void>;
}
