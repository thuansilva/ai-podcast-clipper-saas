import { describe, it, expect } from "vitest";
import { buildAppendProcessVideoPayload } from "~/application/services/append-clips-payload.service";

describe("buildAppendProcessVideoPayload", () => {
  const video = {
    subtitlePreset: "HORMOZI",
    genre: "humor",
    aspectRatio: "9:16",
    autoZoom: true,
  };

  it("modo manual: inclui manual_cuts e nunca excluded_ranges", () => {
    const payload = buildAppendProcessVideoPayload({
      video,
      s3Key: "youtube/batch-uuid/original.mp4",
      mode: "manual",
      manualCuts: [{ title: "Corte 1", start: 2, end: 32 }],
      excludedRanges: [{ start: 1, end: 2 }],
    });

    expect(payload).toEqual({
      s3_key: "youtube/batch-uuid/original.mp4",
      preset: "HORMOZI",
      genre: "humor",
      aspect_ratio: "9:16",
      auto_zoom: true,
      mode: "manual",
      manual_cuts: [{ title: "Corte 1", start: 2, end: 32 }],
    });
    expect(payload).not.toHaveProperty("excluded_ranges");
  });

  it("modo auto: inclui excluded_ranges (quando não vazio) e nunca manual_cuts", () => {
    const payload = buildAppendProcessVideoPayload({
      video,
      s3Key: "youtube/batch-uuid/original.mp4",
      mode: "auto",
      excludedRanges: [{ start: 2, end: 12 }],
    });

    expect(payload).toEqual({
      s3_key: "youtube/batch-uuid/original.mp4",
      preset: "HORMOZI",
      genre: "humor",
      aspect_ratio: "9:16",
      auto_zoom: true,
      mode: "auto",
      excluded_ranges: [{ start: 2, end: 12 }],
    });
    expect(payload).not.toHaveProperty("manual_cuts");
  });

  it("modo auto sem excludedRanges (vazio/ausente): omite o campo, nunca envia []", () => {
    const payload = buildAppendProcessVideoPayload({
      video,
      s3Key: "youtube/batch-uuid/original.mp4",
      mode: "auto",
      excludedRanges: [],
    });

    expect(payload).not.toHaveProperty("excluded_ranges");
  });

  it("usa os fallbacks (NONE/outros/9:16/true) quando os campos do projeto são null", () => {
    const payload = buildAppendProcessVideoPayload({
      video: { subtitlePreset: null, genre: null, aspectRatio: null, autoZoom: null },
      s3Key: "youtube/batch-uuid/original.mp4",
      mode: "manual",
      manualCuts: [{ start: 0, end: 10 }],
    });

    expect(payload.preset).toBe("NONE");
    expect(payload.genre).toBe("outros");
    expect(payload.aspect_ratio).toBe("9:16");
    expect(payload.auto_zoom).toBe(true);
  });
});
