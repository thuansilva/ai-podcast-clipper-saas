import { describe, it, expect } from "vitest";
import {
  parseTimestampToSeconds,
  formatSecondsToTimestamp,
  addSecondsToTimestamp,
  validateManualCut,
} from "~/domain/rules/timestamp-parser";

describe("timestamp-parser", () => {
  describe("parseTimestampToSeconds", () => {
    it("converte MM:SS para segundos", () => {
      expect(parseTimestampToSeconds("00:30")).toBe(30);
      expect(parseTimestampToSeconds("01:15")).toBe(75);
      expect(parseTimestampToSeconds("10:00")).toBe(600);
    });

    it("converte HH:MM:SS para segundos", () => {
      expect(parseTimestampToSeconds("01:02:15")).toBe(3735);
      expect(parseTimestampToSeconds("00:01:30")).toBe(90);
    });

    it("retorna null para formatos inválidos", () => {
      expect(parseTimestampToSeconds("invalido")).toBeNull();
      expect(parseTimestampToSeconds("")).toBeNull();
      expect(parseTimestampToSeconds("-01:20")).toBeNull();
      expect(parseTimestampToSeconds("00:75")).toBeNull();
      expect(parseTimestampToSeconds("01:60:00")).toBeNull();
    });
  });

  describe("formatSecondsToTimestamp", () => {
    it("formata segundos para MM:SS", () => {
      expect(formatSecondsToTimestamp(30)).toBe("00:30");
      expect(formatSecondsToTimestamp(75)).toBe("01:15");
      expect(formatSecondsToTimestamp(599)).toBe("09:59");
    });

    it("formata segundos >= 3600 para HH:MM:SS", () => {
      expect(formatSecondsToTimestamp(3735)).toBe("01:02:15");
    });

    it("trata valores inválidos ou negativos retornando 00:00", () => {
      expect(formatSecondsToTimestamp(-10)).toBe("00:00");
      expect(formatSecondsToTimestamp(NaN)).toBe("00:00");
    });
  });

  describe("addSecondsToTimestamp", () => {
    it("soma segundos a um timestamp MM:SS", () => {
      expect(addSecondsToTimestamp("01:15", 30)).toBe("01:45");
      expect(addSecondsToTimestamp("00:40", 25)).toBe("01:05");
      expect(addSecondsToTimestamp("01:00", 60)).toBe("02:00");
    });

    it("lida com string inválida retornando valor inicial com delta", () => {
      expect(addSecondsToTimestamp("invalido", 30)).toBe("00:30");
    });

    it("não permite segundos resultantes negativos", () => {
      expect(addSecondsToTimestamp("00:10", -30)).toBe("00:00");
    });
  });

  describe("validateManualCut", () => {
    it("valida corte correto", () => {
      expect(validateManualCut(10, 40)).toEqual({ valid: true });
    });

    it("rejeita quando fim <= inicio", () => {
      const result = validateManualCut(40, 30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maior");
    });

    it("rejeita quando início é negativo", () => {
      const result = validateManualCut(-5, 30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("negativo");
    });

    it("rejeita corte com duração menor que 5s", () => {
      const result = validateManualCut(10, 13);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("mínima");
    });

    it("rejeita corte com duração maior que o limite (ex: 180s)", () => {
      const result = validateManualCut(10, 200);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("máxima");
    });

    it("rejeita quando corte ultrapassa a duração total do vídeo", () => {
      const result = validateManualCut(100, 150, 120);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("ultrapassa a duração total");
    });

    it("rejeita valores NaN", () => {
      const result = validateManualCut(NaN, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("inválidos");
    });
  });
});
