import type { ClipEntity, LayoutMode, SubtitlePreset } from "../entities/clip";

export interface CreateClipInput {
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
  subtitlePreset?: SubtitlePreset;
  layoutMode?: LayoutMode;
  transcriptWords?: unknown;
}

export interface UpdateClipInput {
  title?: string;
  subtitlePreset?: SubtitlePreset;
  transcriptWords?: unknown;
}

export interface IClipRepository {
  findById(id: string): Promise<ClipEntity | null>;
  findByUserId(userId: string): Promise<ClipEntity[]>;
  createMany(clips: CreateClipInput[]): Promise<number>;
  update(id: string, input: UpdateClipInput): Promise<ClipEntity>;
  delete(id: string): Promise<void>;
}
