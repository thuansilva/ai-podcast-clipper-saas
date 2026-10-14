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
  fileSizeBytes: number;
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
  thumbnailUrl?: string;
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
  userId: string;
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
  subtitlePreset?: string;
  clipModel?: string;
  aspectRatio?: string;
  autoZoom?: boolean;
}

/**
 * Intervalo de tempo em segundos, absoluto no vídeo ORIGINAL, no formato
 * `{ start, end }` — mesma convenção de `excludedRanges` no wire format
 * HTTP/Inngest (ver `AddClipsToProjectEventData`). Deliberadamente diferente
 * de `AiSliceDTO`/`ManualCutDTO` (`startTime`/`endTime`), que são DTOs
 * internos da aplicação, não o formato de borda.
 */
export interface TimeRangeDTO {
  start: number;
  end: number;
}

/** O slice novo escolhido pelo usuário para a IA analisar (modo "auto" de
 * `AddClipsToProjectInput`). Mesma convenção `startTime`/`endTime` de
 * `ManualCutDTO`. */
export interface AiSliceDTO {
  startTime: number;
  endTime: number;
}

/**
 * Input de `AddClipsToProjectUseCase` ("adicionar mais cortes" a um projeto
 * já existente — RF novo). `mode` reaproveita `ProcessingMode` ("manual" |
 * "auto"): aqui, "auto" significa "IA gera mais" sobre um novo slice
 * (`aiSlice`), nunca sobre o vídeo inteiro de novo.
 */
export interface AddClipsToProjectInput {
  projectId: string;
  userId: string;
  mode: ProcessingMode;
  /** Obrigatório e não vazio quando `mode === "manual"`. Tempos absolutos
   * no vídeo ORIGINAL (mesma convenção de `ImportYouTubeVideoInput.manualCuts`). */
  manualCuts?: ManualCutDTO[];
  /** Obrigatório quando `mode === "auto"`. Tempos absolutos no vídeo
   * ORIGINAL. */
  aiSlice?: AiSliceDTO;
}

export interface AddClipsToProjectOutput {
  success: boolean;
  batchId: string;
}

/**
 * Payload do evento Inngest `"append-clips-events"`, enviado por
 * `AddClipsToProjectUseCase` e consumido por `appendClipsToProjectHandler`
 * (`src/inngest/functions.ts`). `excludedRanges` é SEMPRE enviado (pode ser
 * `[]`), em segundos, absoluto no vídeo ORIGINAL — nunca no tempo do
 * arquivo baixado/concatenado deste lote (o handler remapeia antes de
 * repassar ao backend Python).
 */
export interface AddClipsToProjectEventData {
  uploadedFileId: string;
  batchId: string;
  userId: string;
  mode: ProcessingMode;
  manualCuts?: ManualCutDTO[];
  aiSlice?: AiSliceDTO;
  excludedRanges: TimeRangeDTO[];
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

