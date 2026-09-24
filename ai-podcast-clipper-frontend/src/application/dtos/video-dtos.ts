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
  thumbnailUrl?: string;
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
  sliceStartTime?: number;
  sliceEndTime?: number;
  genre?: string;
  clipModel?: string;
  aspectRatio?: string;
  autoZoom?: boolean;
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

export interface TriggerVideoProcessingInput {
  uploadedFileId: string;
  userId?: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}

export interface TriggerVideoProcessingOutput {
  success: boolean;
  triggered: boolean;
}

export interface UploadedFileDTO {
  id: string;
  s3Key: string;
  filename: string;
  status: string;
  clipsCount: number;
  createdAt: Date;
  thumbnailUrl?: string;
}

export interface ListUserVideosInput {
  userId: string;
  page?: number;
  limit?: number;
  search?: string;
  sort?: "asc" | "desc";
}

export interface ListUserVideosOutput {
  data: UploadedFileDTO[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

