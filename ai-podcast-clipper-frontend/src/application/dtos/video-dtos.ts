export type ProcessingMode = "auto" | "manual";

export interface ManualCutDTO {
  id?: string;
  title?: string;
  startTime: number;
  endTime: number;
}

export interface GenerateUploadUrlInput {
  userId: string;
  filename: string;
  contentType: string;
}

export interface GenerateUploadUrlOutput {
  success: boolean;
  signedUrl: string;
  uploadedFileId: string;
  s3Key: string;
}

export interface ImportYouTubeVideoInput {
  userId: string;
  url: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}

export interface ImportYouTubeVideoOutput {
  success: boolean;
  uploadedFileId: string;
  s3Key: string;
  videoId: string;
}

export interface ProcessVideoEventData {
  uploadedFileId: string;
  userId?: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}
