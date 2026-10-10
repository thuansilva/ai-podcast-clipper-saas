import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";

/**
 * Subconjunto das colunas de `UploadedFile` usadas para montar o payload
 * enviado ao endpoint de processamento (Modal/GPU). Estrutural, para que a
 * função seja pura e testável sem Prisma.
 */
export interface ProcessVideoPayloadVideo {
  s3Key: string;
  subtitlePreset: string | null;
  genre: string | null;
  aspectRatio: string | null;
  autoZoom: boolean | null;
  clipModel: string | null;
  /** JSON serializado dos cortes manuais salvos (ou null). Ainda não lido: ver Fase 2 (D6). */
  manualCutsJson?: unknown;
}

export interface ProcessVideoPayloadEventData {
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}

export interface BuildProcessVideoPayloadInput {
  video: ProcessVideoPayloadVideo;
  eventData: ProcessVideoPayloadEventData;
}

export interface ProcessVideoWireManualCut {
  title?: string;
  start: number;
  end: number;
}

/** Corpo HTTP enviado a `PROCESS_VIDEO_ENDPOINT` (wire format em snake_case). */
export interface ProcessVideoWirePayload {
  s3_key: string;
  preset: string;
  genre: string;
  aspect_ratio: string;
  auto_zoom: boolean;
  mode: string;
  manual_cuts?: ProcessVideoWireManualCut[];
}

/**
 * Monta o corpo do `POST /process_video`.
 *
 * Fase 2 (D6): `mode` é ortogonal a `clipModel` (opção de LAYOUT,
 * `"auto"`/`"face_focus"`) — `clipModel` NUNCA é lido aqui. `mode` é
 * **derivado** da presença de cortes manuais, nunca de uma coluna nova:
 * `video.manualCutsJson != null` (cortes já persistidos, ex.: retry) OU
 * `eventData.manualCuts` não vazio (cortes do evento em trânsito, ainda não
 * necessariamente persistidos no momento em que este payload é montado).
 * Qualquer uma das duas fontes com cortes reais é suficiente para `"manual"`;
 * na ausência de ambas, `"auto"`.
 */
export function buildProcessVideoPayload({
  video,
  eventData,
}: BuildProcessVideoPayloadInput): ProcessVideoWirePayload {
  const hasManualCuts =
    video.manualCutsJson != null ||
    (Array.isArray(eventData.manualCuts) && eventData.manualCuts.length > 0);

  return {
    s3_key: video.s3Key,
    preset: video.subtitlePreset ?? eventData.preset ?? "NONE",
    genre: video.genre ?? "auto",
    aspect_ratio: video.aspectRatio ?? "9:16",
    auto_zoom: video.autoZoom ?? true,
    mode: hasManualCuts ? "manual" : "auto",
    manual_cuts: eventData.manualCuts?.map((cut) => ({
      title: cut.title,
      start: cut.startTime,
      end: cut.endTime,
    })),
  };
}
