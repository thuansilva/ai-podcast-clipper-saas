import { describe, it, expect } from "vitest";
import { defaultCutRange, normalizeRange } from "~/lib/cut-slider";

describe("normalizeRange", () => {
  it("mantém um trecho válido", () => {
    expect(normalizeRange([0, 30], [10, 40], 600, 60)).toEqual([10, 40]);
  });
  it("início e fim iguais: afasta 1s", () => {
    expect(normalizeRange([0, 30], [100, 100], 600)).toEqual([100, 101]);
    expect(normalizeRange([100, 101], [600, 600], 600)).toEqual([599, 600]);
  });
  it("fim arrastado além de 60s puxa o início", () => {
    expect(normalizeRange([100, 130], [100, 300], 600, 60)).toEqual([240, 300]);
  });
  it("início arrastado além de 60s puxa o fim", () => {
    expect(normalizeRange([240, 300], [10, 300], 600, 60)).toEqual([10, 70]);
  });
  it("sem maxLength não limita (Fatiador)", () => {
    expect(normalizeRange([0, 300], [0, 650], 650)).toEqual([0, 650]);
  });
  it("respeita o fim do vídeo", () => {
    expect(normalizeRange([0, 30], [590, 900], 600, 60)).toEqual([590, 600]);
  });
});

describe("defaultCutRange", () => {
  it("primeiro corte: 0..30", () => expect(defaultCutRange(0, 600)).toEqual([0, 30]));
  it("depois do último corte", () => expect(defaultCutRange(90, 600)).toEqual([90, 120]));
  it("clamp no fim do vídeo", () => {
    expect(defaultCutRange(600, 600)).toEqual([599, 600]);
    expect(defaultCutRange(590, 600)).toEqual([590, 600]);
  });
  it("vídeo curto (< 30s)", () => expect(defaultCutRange(0, 20)).toEqual([0, 20]));
});
