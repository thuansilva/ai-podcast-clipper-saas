import { describe, it, expect } from "vitest";
import {
  NORMAL_MAX_DURATION_SECONDS,
  STUDIO_MAX_DURATION_SECONDS,
  MAX_FILE_SIZE_BYTES,
  getMaxDurationForPlan,
  validateVideoDuration,
  validateFileSize,
} from "~/domain/rules/video-limits";

describe("Video Limits Domain Rules", () => {
  describe("Constantes", () => {
    it("deve definir 2 horas (7200s) para o plano normal/starter", () => {
      expect(NORMAL_MAX_DURATION_SECONDS).toBe(7200);
    });

    it("deve definir 3 horas (10800s) para o plano studio", () => {
      expect(STUDIO_MAX_DURATION_SECONDS).toBe(10800);
    });

    it("deve definir 2 GB para o tamanho máximo de arquivo", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe("getMaxDurationForPlan", () => {
    it("deve retornar 7200s (2h) para plano STARTER, FREE, nulo ou indefinido", () => {
      expect(getMaxDurationForPlan("STARTER")).toBe(7200);
      expect(getMaxDurationForPlan("FREE")).toBe(7200);
      expect(getMaxDurationForPlan(undefined)).toBe(7200);
      expect(getMaxDurationForPlan(null)).toBe(7200);
      expect(getMaxDurationForPlan("qualquer_outro")).toBe(7200);
    });

    it("deve retornar 10800s (3h) para plano STUDIO (case insensitive)", () => {
      expect(getMaxDurationForPlan("STUDIO")).toBe(10800);
      expect(getMaxDurationForPlan("studio")).toBe(10800);
      expect(getMaxDurationForPlan("Studio")).toBe(10800);
    });
  });

  describe("validateVideoDuration", () => {
    it("deve aceitar vídeos dentro do limite para o plano normal (<= 2h)", () => {
      const res1 = validateVideoDuration(3600, "STARTER");
      expect(res1.valid).toBe(true);
      expect(res1.error).toBeUndefined();

      const resEdge = validateVideoDuration(7200, "STARTER");
      expect(resEdge.valid).toBe(true);
    });

    it("deve rejeitar vídeos acima de 2h para o plano normal", () => {
      const res = validateVideoDuration(7201, "STARTER");
      expect(res.valid).toBe(false);
      expect(res.maxAllowedSeconds).toBe(7200);
      expect(res.error).toContain("excede o limite de 2h");
      expect(res.error).toContain("Studio");
    });

    it("deve aceitar vídeos de até 3h (10800s) para o plano STUDIO", () => {
      const res1 = validateVideoDuration(9000, "STUDIO");
      expect(res1.valid).toBe(true);

      const resEdge = validateVideoDuration(10800, "STUDIO");
      expect(resEdge.valid).toBe(true);
    });

    it("deve rejeitar vídeos acima de 3h para o plano STUDIO", () => {
      const res = validateVideoDuration(10801, "STUDIO");
      expect(res.valid).toBe(false);
      expect(res.maxAllowedSeconds).toBe(10800);
      expect(res.error).toContain("excede o limite máximo permitido de 3h");
    });
  });

  describe("validateFileSize", () => {
    it("deve aceitar arquivos menores ou iguais a 2 GB", () => {
      expect(validateFileSize(100 * 1024 * 1024).valid).toBe(true);
      expect(validateFileSize(MAX_FILE_SIZE_BYTES).valid).toBe(true);
    });

    it("deve rejeitar arquivos maiores que 2 GB com mensagem amigável", () => {
      const res = validateFileSize(MAX_FILE_SIZE_BYTES + 1);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("2 GB");
    });
  });
});
