import { describe, it, expect } from "vitest";
import {
  buildProcessVideoPayload,
  type ProcessVideoPayloadVideo,
} from "~/application/services/process-video-payload.service";
import type { ManualCutDTO } from "~/application/dtos/video-dtos";

const baseVideo: ProcessVideoPayloadVideo = {
  s3Key: "uploads/file-123/video.mp4",
  subtitlePreset: null,
  genre: null,
  aspectRatio: null,
  autoZoom: null,
  clipModel: null,
};

const manualCuts: ManualCutDTO[] = [
  { id: "cut-1", title: "Momento 1", startTime: 10, endTime: 40 },
  { id: "cut-2", title: "Momento 2", startTime: 100, endTime: 170 },
];

describe("buildProcessVideoPayload", () => {
  describe("comportamento preservado (characterization)", () => {
    it("usa os defaults de preset/genre/aspect_ratio/auto_zoom quando o vídeo não tem essas opções", () => {
      const payload = buildProcessVideoPayload({
        video: baseVideo,
        eventData: {},
      });

      expect(payload).toEqual({
        s3_key: "uploads/file-123/video.mp4",
        preset: "NONE",
        genre: "auto",
        aspect_ratio: "9:16",
        auto_zoom: true,
        mode: "auto",
      });
    });

    it("prioriza subtitlePreset do vídeo sobre o preset do evento", () => {
      const payload = buildProcessVideoPayload({
        video: { ...baseVideo, subtitlePreset: "MRBEAST" },
        eventData: { preset: "HORMOZI" },
      });

      expect(payload.preset).toBe("MRBEAST");
    });

    it("omite manual_cuts quando o evento não traz cortes", () => {
      const payload = buildProcessVideoPayload({
        video: baseVideo,
        eventData: { mode: "auto" },
      });

      // Undefined é descartado pelo JSON.stringify, então o corpo HTTP não traz a chave.
      expect(payload.manual_cuts).toBeUndefined();
      expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("manual_cuts");
    });
  });

  describe("regressão do BLOCKER de corte manual (Fase 1 — TDD red)", () => {
    it("deve enviar mode='manual' quando o evento pede corte manual e clipModel é o layout 'auto'", () => {
      const payload = buildProcessVideoPayload({
        video: { ...baseVideo, clipModel: "auto" },
        eventData: { preset: "HORMOZI", mode: "manual", manualCuts },
      });

      expect(payload.mode).toBe("manual");
      expect(payload.manual_cuts).toEqual([
        { title: "Momento 1", start: 10, end: 40 },
        { title: "Momento 2", start: 100, end: 170 },
      ]);
    });

    it("deve enviar mode='manual' quando o evento pede corte manual e clipModel é o layout 'face_focus'", () => {
      const payload = buildProcessVideoPayload({
        video: { ...baseVideo, clipModel: "face_focus" },
        eventData: { preset: "HORMOZI", mode: "manual", manualCuts },
      });

      expect(payload.mode).toBe("manual");
    });

    it("deve enviar mode='manual' quando há cortes manuais salvos em manualCutsJson (D6), mesmo sem mode no evento", () => {
      const payload = buildProcessVideoPayload({
        video: {
          ...baseVideo,
          clipModel: "auto",
          manualCutsJson: JSON.stringify(manualCuts),
        },
        eventData: {},
      });

      expect(payload.mode).toBe("manual");
    });

    it("deve enviar mode='auto' (nunca um valor de layout) quando clipModel é 'face_focus' sem cortes manuais", () => {
      const payload = buildProcessVideoPayload({
        video: { ...baseVideo, clipModel: "face_focus" },
        eventData: { preset: "HORMOZI", mode: "auto" },
      });

      // Contrato v2 (RN-PIPE-MANUAL-01): mode aceita somente "auto" | "manual".
      expect(payload.mode).toBe("auto");
    });
  });
});
