import type { ProcessingMode, TimeRangeDTO } from "~/application/dtos/video-dtos";
import type { ProcessVideoWireManualCut } from "./process-video-payload.service";

/** Subconjunto de colunas de `UploadedFile` usadas para montar o payload do
 * lote. Estrutural (sem Prisma), mesma convenção de
 * `ProcessVideoPayloadVideo` em `process-video-payload.service.ts`. */
export interface AppendProcessVideoPayloadVideo {
  subtitlePreset: string | null;
  genre: string | null;
  aspectRatio: string | null;
  autoZoom: boolean | null;
}

export interface BuildAppendProcessVideoPayloadInput {
  video: AppendProcessVideoPayloadVideo;
  /** s3Key do PRÓPRIO lote (nunca o s3Key do projeto nem de outro lote). */
  s3Key: string;
  mode: ProcessingMode;
  /** Já remapeados para o tempo do arquivo baixado deste lote (wire-ready,
   * `{title, start, end}`). Só usado quando `mode === "manual"`. */
  manualCuts?: ProcessVideoWireManualCut[];
  /** Já remapeados para o tempo do arquivo baixado deste lote. Só usado
   * (e só enviado, se não vazio) quando `mode === "auto"` — omitido do wire
   * body em qualquer outro caso, mesma convenção de omitir `manual_cuts`
   * quando não aplicável (`core/schemas.py` é `extra="forbid"`). */
  excludedRanges?: TimeRangeDTO[];
}

/**
 * Corpo HTTP do `/process_video` para um LOTE de "adicionar mais cortes".
 *
 * `excluded_ranges` é um campo NOVO, ainda não implementado no backend
 * Python no momento em que este código foi escrito (ver handback da
 * tarefa) — mesma unidade/timeline de `manual_cuts[].start/end`: segundos
 * no arquivo que está em `s3_key`, NUNCA no vídeo original.
 */
export interface AppendProcessVideoWirePayload {
  s3_key: string;
  preset: string;
  genre: string;
  aspect_ratio: string;
  auto_zoom: boolean;
  mode: string;
  manual_cuts?: ProcessVideoWireManualCut[];
  excluded_ranges?: TimeRangeDTO[];
}

export function buildAppendProcessVideoPayload({
  video,
  s3Key,
  mode,
  manualCuts,
  excludedRanges,
}: BuildAppendProcessVideoPayloadInput): AppendProcessVideoWirePayload {
  return {
    s3_key: s3Key,
    preset: video.subtitlePreset ?? "NONE",
    genre: video.genre ?? "outros",
    aspect_ratio: video.aspectRatio ?? "9:16",
    auto_zoom: video.autoZoom ?? true,
    mode,
    ...(mode === "manual" && manualCuts && manualCuts.length > 0
      ? { manual_cuts: manualCuts }
      : {}),
    ...(mode === "auto" && excludedRanges && excludedRanges.length > 0
      ? { excluded_ranges: excludedRanges }
      : {}),
  };
}
