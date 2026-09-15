import { describe, it, expect } from "vitest";
import {
  signInSchema,
  signUpSchema,
  verifyCodeSchema,
} from "~/components/auth/auth-schemas";

describe("Auth Validation Schemas (Zod)", () => {
  describe("signInSchema", () => {
    it("deve validar credenciais corretas", () => {
      const result = signInSchema.safeParse({
        email: "usuario@podcast.com",
        password: "senhaSegura12345",
      });
      expect(result.success).toBe(true);
    });

    it("deve rejeitar email vazio ou em formato invalido", () => {
      const emptyResult = signInSchema.safeParse({
        email: "",
        password: "senhaSegura12345",
      });
      expect(emptyResult.success).toBe(false);
      if (!emptyResult.success) {
        expect(emptyResult.error.errors[0]?.message).toMatch(/email/i);
      }

      const invalidResult = signInSchema.safeParse({
        email: "email-invalido",
        password: "senhaSegura12345",
      });
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.errors[0]?.message).toContain("Formato de email inválido");
      }
    });

    it("deve rejeitar email com mais de 255 caracteres", () => {
      const longEmail = `${"a".repeat(250)}@test.com`;
      const result = signInSchema.safeParse({
        email: longEmail,
        password: "senhaSegura12345",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain("255 caracteres");
      }
    });

    it("deve rejeitar senha com menos de 15 caracteres", () => {
      const result = signInSchema.safeParse({
        email: "usuario@podcast.com",
        password: "12345678901234",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain("no mínimo 15 caracteres");
      }
    });

    it("deve rejeitar senha com mais de 72 caracteres para prevenir DoS/buffer injection", () => {
      const longPassword = "A".repeat(73);
      const result = signInSchema.safeParse({
        email: "usuario@podcast.com",
        password: longPassword,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain("72 caracteres");
      }
    });
  });

  describe("signUpSchema", () => {
    it("deve validar dados de cadastro corretos", () => {
      const result = signUpSchema.safeParse({
        email: "novo@podcast.com",
        password: "senhaValidaSegura2026",
      });
      expect(result.success).toBe(true);
    });

    it("deve rejeitar senha com menos de 15 caracteres no cadastro", () => {
      const result = signUpSchema.safeParse({
        email: "novo@podcast.com",
        password: "curta",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain("no mínimo 15 caracteres");
      }
    });

    it("deve rejeitar senha com mais de 72 caracteres no cadastro", () => {
      const result = signUpSchema.safeParse({
        email: "novo@podcast.com",
        password: "P".repeat(73),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain("72 caracteres");
      }
    });
  });

  describe("verifyCodeSchema", () => {
    it("deve validar código de verificação com exatamente 6 dígitos numéricos", () => {
      const result = verifyCodeSchema.safeParse({ code: "123456" });
      expect(result.success).toBe(true);
    });

    it("deve rejeitar código com tamanho diferente de 6 dígitos", () => {
      const resultShort = verifyCodeSchema.safeParse({ code: "12345" });
      expect(resultShort.success).toBe(false);

      const resultLong = verifyCodeSchema.safeParse({ code: "1234567" });
      expect(resultLong.success).toBe(false);
    });

    it("deve rejeitar código contendo letras ou caracteres especiais", () => {
      const resultLetters = verifyCodeSchema.safeParse({ code: "12A456" });
      expect(resultLetters.success).toBe(false);
      if (!resultLetters.success) {
        expect(resultLetters.error.errors[0]?.message).toMatch(/apenas números/i);
      }
    });
  });
});
