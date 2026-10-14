import { describe, it, expect } from "vitest";
import {
  remapOriginalRangeToOutput,
  remapOutputTimeToOriginal,
} from "~/domain/services/time-range-remap.service";

describe("time-range-remap.service", () => {
  const mergedRange = {
    original_start: 198,
    original_end: 402,
    offset_in_output: 0,
  };

  it("remapOriginalRangeToOutput converte um intervalo original para o tempo do arquivo de saída", () => {
    expect(remapOriginalRangeToOutput({ start: 200, end: 210 }, mergedRange)).toEqual({
      start: 2,
      end: 12,
    });
    expect(remapOriginalRangeToOutput({ start: 250, end: 270 }, mergedRange)).toEqual({
      start: 52,
      end: 72,
    });
  });

  it("remapOriginalRangeToOutput funciona com offset_in_output não-zero", () => {
    const shifted = { original_start: 500, original_end: 700, offset_in_output: 10 };
    expect(remapOriginalRangeToOutput({ start: 510, end: 520 }, shifted)).toEqual({
      start: 20,
      end: 30,
    });
  });

  it("remapOutputTimeToOriginal converte um instante do arquivo de saída de volta ao tempo original", () => {
    expect(remapOutputTimeToOriginal(50, mergedRange)).toBe(248);
    expect(remapOutputTimeToOriginal(80, mergedRange)).toBe(278);
  });

  it("remapOriginalRangeToOutput e remapOutputTimeToOriginal são inversas", () => {
    const original = { start: 220, end: 260 };
    const output = remapOriginalRangeToOutput(original, mergedRange);
    expect(remapOutputTimeToOriginal(output.start, mergedRange)).toBe(original.start);
    expect(remapOutputTimeToOriginal(output.end, mergedRange)).toBe(original.end);
  });
});
