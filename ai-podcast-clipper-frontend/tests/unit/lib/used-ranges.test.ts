import { describe, it, expect } from "vitest";
import { mergeRanges } from "~/lib/used-ranges";

describe("mergeRanges", () => {
  it("retorna vazio para entrada vazia", () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it("mantém intervalos disjuntos separados, ordenados por início", () => {
    expect(
      mergeRanges([
        { start: 100, end: 130 },
        { start: 0, end: 30 },
      ]),
    ).toEqual([
      { start: 0, end: 30 },
      { start: 100, end: 130 },
    ]);
  });

  it("mescla intervalos sobrepostos", () => {
    expect(
      mergeRanges([
        { start: 0, end: 30 },
        { start: 20, end: 50 },
      ]),
    ).toEqual([{ start: 0, end: 50 }]);
  });

  it("mescla intervalos encostados (fim == início)", () => {
    expect(
      mergeRanges([
        { start: 0, end: 30 },
        { start: 30, end: 60 },
      ]),
    ).toEqual([{ start: 0, end: 60 }]);
  });

  it("não modifica o array original", () => {
    const input = [{ start: 0, end: 30 }];
    mergeRanges(input);
    expect(input).toEqual([{ start: 0, end: 30 }]);
  });
});
