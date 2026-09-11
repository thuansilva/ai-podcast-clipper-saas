export type SourceType = "UPLOAD" | "YOUTUBE";

export type UploadedFileStatus =
  | "queued"
  | "processing"
  | "processed"
  | "no credits"
  | "failed";

export interface UploadedFileEntity {
  id: string;
  userId: string;
  s3Key: string;
  displayName?: string | null;
  sourceType: SourceType;
  youtubeUrl?: string | null;
  durationSeconds: number;
  creditsCost: number;
  uploaded: boolean;
  status: UploadedFileStatus;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
