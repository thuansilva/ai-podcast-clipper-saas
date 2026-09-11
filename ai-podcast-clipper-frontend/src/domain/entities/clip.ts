export type SubtitlePreset = "HORMOZI" | "MINIMAL" | "NEON";

export type LayoutMode = "SMART_CROP" | "RESIZE";

export interface ClipEntity {
  id: string;
  userId: string;
  uploadedFileId?: string | null;
  s3Key: string;
  title: string;
  hook?: string | null;
  viralityScore?: number | null;
  reason?: string | null;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  subtitlePreset: SubtitlePreset;
  layoutMode: LayoutMode;
  transcriptWords?: unknown;
  createdAt: Date;
  updatedAt: Date;
}
