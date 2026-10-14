import { describe, it, expect } from "vitest";
import {
  buildGeneratingPlaceholders,
  describeGeneratingBanner,
} from "~/lib/generating-batch-placeholders";

describe("buildGeneratingPlaceholders", () => {
  it("manual: 1 placeholder por corte pedido, com título e intervalo mm:ss", () => {
    const result = buildGeneratingPlaceholders([
      {
        id: "b1",
        mode: "manual",
        status: "queued",
        rangesJson: [
          { startTime: 60, endTime: 125, title: "Intro" },
          { startTime: 3600, endTime: 3660 },
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: "manual",
      status: "queued",
      title: "Intro",
      rangeLabel: "01:00 – 02:05",
    });
    expect(result[1]).toMatchObject({
      title: null,
      rangeLabel: "1:00:00 – 1:01:00",
    });
    expect(new Set(result.map((p) => p.key)).size).toBe(2);
  });

  it("auto: 1 placeholder 'IA analisando' com o trecho", () => {
    const result = buildGeneratingPlaceholders([
      {
        id: "b2",
        mode: "auto",
        status: "processing",
        rangesJson: { startTime: 720, endTime: 1320 },
      },
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        kind: "auto",
        status: "processing",
        title: "IA analisando",
        rangeLabel: "12:00 – 22:00",
      }),
    ]);
  });

  it("ignora entradas inválidas e cai num placeholder genérico por lote", () => {
    const result = buildGeneratingPlaceholders([
      { id: "b3", mode: "manual", status: "queued", rangesJson: "lixo" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "manual", rangeLabel: "" });
  });
});

describe("describeGeneratingBanner", () => {
  const manual = (n: number) =>
    buildGeneratingPlaceholders([
      {
        id: "m",
        mode: "manual",
        status: "queued",
        rangesJson: Array.from({ length: n }, (_, i) => ({
          startTime: i * 100,
          endTime: i * 100 + 50,
        })),
      },
    ]);

  it("plural e singular", () => {
    expect(describeGeneratingBanner(manual(3))).toBe("Gerando 3 cortes…");
    expect(describeGeneratingBanner(manual(1))).toBe("Gerando 1 corte…");
  });

  it("só IA", () => {
    const auto = buildGeneratingPlaceholders([
      { id: "a", mode: "auto", status: "queued", rangesJson: { startTime: 0, endTime: 60 } },
    ]);
    expect(describeGeneratingBanner(auto)).toBe(
      "A IA está analisando o trecho selecionado…",
    );
  });
});
