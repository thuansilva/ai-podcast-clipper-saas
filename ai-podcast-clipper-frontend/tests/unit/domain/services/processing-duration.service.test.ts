import { describe, it, expect } from "vitest";
import {
  computeEffectiveProcessingDuration,
  assertManualCutsWithinVideo,
} from "~/domain/services/processing-duration.service";
import { ManualCutBeyondVideoError } from "~/domain/errors/manual-cut-beyond-video-error";

describe("computeEffectiveProcessingDuration", () => {
  const FIVE_HOURS = 5 * 3600;

  it("manual com cortes: soma das durações dos cortes, ignorando vídeo e trecho", () => {
    expect(
      computeEffectiveProcessingDuration({
        isManual: true,
        manualCuts: [
          { startTime: 10, endTime: 50 },
          { startTime: 100, endTime: 160 },
        ],
        sliceStartTime: 0,
        sliceEndTime: 0,
        videoDurationSeconds: FIVE_HOURS,
      }),
    ).toBe(100);
  });

  it("manual: corte invertido conta como 0", () => {
    expect(
      computeEffectiveProcessingDuration({
        isManual: true,
        manualCuts: [{ startTime: 50, endTime: 10 }],
        videoDurationSeconds: FIVE_HOURS,
      }),
    ).toBe(0);
  });

  it("automático com trecho do Fatiador: tamanho do trecho", () => {
    expect(
      computeEffectiveProcessingDuration({
        isManual: false,
        sliceStartTime: 100,
        sliceEndTime: 700,
        videoDurationSeconds: FIVE_HOURS,
      }),
    ).toBe(600);
  });

  it("automático sem trecho: duração do vídeo inteiro", () => {
    expect(
      computeEffectiveProcessingDuration({
        isManual: false,
        sliceStartTime: 0,
        sliceEndTime: 0,
        videoDurationSeconds: FIVE_HOURS,
      }),
    ).toBe(FIVE_HOURS);
  });
});

describe("assertManualCutsWithinVideo", () => {
  it("lança ManualCutBeyondVideoError quando algum corte termina após o vídeo", () => {
    expect(() =>
      assertManualCutsWithinVideo(
        [
          { startTime: 0, endTime: 30 },
          { startTime: 50, endTime: 130 },
        ],
        120,
      ),
    ).toThrow(ManualCutBeyondVideoError);
  });

  it("aceita corte terminando exatamente no fim do vídeo", () => {
    expect(() =>
      assertManualCutsWithinVideo([{ startTime: 60, endTime: 120 }], 120),
    ).not.toThrow();
  });
});
