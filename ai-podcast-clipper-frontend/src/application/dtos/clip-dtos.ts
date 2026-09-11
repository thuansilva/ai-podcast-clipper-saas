import type { SubtitlePreset } from "~/domain/entities/clip";

export interface GetClipPlayUrlInput {
  clipId: string;
  userId: string;
}

export interface GetClipPlayUrlOutput {
  success: boolean;
  url: string;
}

export interface UpdateClipUseCaseInput {
  clipId: string;
  userId: string;
  title?: string;
  subtitlePreset?: SubtitlePreset;
  transcriptWords?: unknown;
}

export interface UpdateClipUseCaseOutput {
  success: boolean;
  clipId: string;
}

export interface DeleteClipUseCaseInput {
  clipId: string;
  userId: string;
}

export interface DeleteClipUseCaseOutput {
  success: boolean;
  clipId: string;
}
