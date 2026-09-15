import { describe, it, expect } from "vitest";
import { VideoCut, validateManualCut } from "~/domain/value-objects/video-cut.vo";
import { DomainError } from "~/domain/errors/domain-error";

describe("VideoCut (Value Object)", () => {
  describe("VideoCut Class e Invariantes", () => {
    it("deve criar um corte válido e calcular duração e créditos", () => {
      const cut = VideoCut.create(10, 40); // 30s
      expect(cut.startSeconds).toBe(10);
      expect(cut.endSeconds).toBe(40);
      expect(cut.durationSeconds).toBe(30);
      expect(cut.calculateCredits()).toBe(1);

      const longCut = VideoCut.create(0, 125); // 125s -> 3 créditos
      expect(longCut.durationSeconds).toBe(125);
      expect(longCut.calculateCredits()).toBe(3);
    });

    it("deve lançar DomainError para corte inválido via .create()", () => {
      expect(() => VideoCut.create(40, 30)).toThrow(DomainError);
      expect(() => VideoCut.create(-5, 30)).toThrow(DomainError);
      expect(() => VideoCut.create(10, 13)).toThrow(DomainError); // < 5s
      expect(() => VideoCut.create(0, 200)).toThrow(DomainError); // > 180s
      expect(() => VideoCut.create(0, 100, 50)).toThrow(DomainError); // > maxVideoDuration
    });

    it("deve comparar igualdade de valor entre dois cortes", () => {
      const cut1 = VideoCut.create(10, 50);
      const cut2 = VideoCut.create(10, 50);
      const cut3 = VideoCut.create(15, 50);

      expect(cut1.equals(cut2)).toBe(true);
      expect(cut1.equals(cut3)).toBe(false);
    });
  });

  describe("Validação estática e função validateManualCut", () => {
    it("valida corte correto", () => {
      expect(VideoCut.validate(10, 40)).toEqual({ valid: true });
      expect(validateManualCut(10, 40)).toEqual({ valid: true });
    });

    it("rejeita quando fim <= inicio", () => {
      const res = validateManualCut(40, 30);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("maior");
    });

    it("rejeita quando início é negativo", () => {
      const res = validateManualCut(-5, 30);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("negativo");
    });

    it("rejeita corte com duração menor que 5s", () => {
      const res = validateManualCut(10, 13);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("mínima");
    });

    it("rejeita corte com duração maior que 180s", () => {
      const res = validateManualCut(10, 200);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("máxima");
    });

    it("rejeita quando ultrapassa a duração total do vídeo", () => {
      const res = validateManualCut(100, 150, 120);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("ultrapassa a duração total");
    });

    it("rejeita valores NaN", () => {
      const res = validateManualCut(NaN, 50);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("inválidos");
    });
  });
});
