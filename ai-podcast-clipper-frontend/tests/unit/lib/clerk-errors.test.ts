import { describe, it, expect } from "vitest";
import { formatClerkError } from "~/lib/clerk-errors";

describe("formatClerkError", () => {
  it("deve traduzir form_identifier_not_found para conta não encontrada", () => {
    const error = {
      errors: [{ code: "form_identifier_not_found", message: "Couldn't find your account." }],
    };
    expect(formatClerkError(error)).toBe("Conta não encontrada para este email.");
  });

  it("deve traduzir form_password_incorrect para senha incorreta", () => {
    const error = {
      errors: [{ code: "form_password_incorrect", message: "Incorrect password." }],
    };
    expect(formatClerkError(error)).toBe("Senha incorreta. Verifique suas credenciais e tente novamente.");
  });

  it("deve traduzir form_identifier_exists para email já cadastrado", () => {
    const error = {
      errors: [{ code: "form_identifier_exists", message: "Email already exists." }],
    };
    expect(formatClerkError(error)).toBe("Este email já está cadastrado. Tente entrar.");
  });

  it("deve traduzir form_code_incorrect para código incorreto", () => {
    const error = {
      errors: [{ code: "form_code_incorrect", message: "Incorrect code." }],
    };
    expect(formatClerkError(error)).toBe("Código de verificação incorreto ou expirado.");
  });

  it("deve traduzir senhas fracas ou curtas", () => {
    const errorShort = {
      errors: [{ code: "form_password_length_too_short", message: "Password is too short." }],
    };
    expect(formatClerkError(errorShort)).toBe("A senha deve conter no mínimo 8 caracteres.");

    const errorPwned = {
      errors: [{ code: "form_password_pwned", message: "Password is too common." }],
    };
    expect(formatClerkError(errorPwned)).toBe("Esta senha é muito fraca ou comum. Escolha uma senha mais segura.");
  });

  it("deve traduzir session_exists", () => {
    const error = {
      errors: [{ code: "session_exists", message: "Session already exists." }],
    };
    expect(formatClerkError(error)).toBe("Já existe uma sessão ativa.");
  });

  it("deve repassar mensagem do Clerk quando o código não for mapeado mas houver mensagem", () => {
    const error = {
      errors: [{ code: "custom_unmapped_code", message: "Mensagem detalhada do Clerk." }],
    };
    expect(formatClerkError(error)).toBe("Mensagem detalhada do Clerk.");
  });

  it("deve repassar message de um objeto Error genérico", () => {
    const error = new Error("Falha na conexão de rede.");
    expect(formatClerkError(error)).toBe("Falha na conexão de rede.");
  });

  it("deve retornar mensagem genérica caso não haja código ou mensagem conhecida", () => {
    expect(formatClerkError(null)).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
    expect(formatClerkError(undefined)).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
    expect(formatClerkError({})).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
    expect(formatClerkError({ errors: [] })).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
    expect(formatClerkError({ errors: [{ code: "unmapped_without_message" }] })).toBe(
      "Ocorreu um erro ao processar sua solicitação. Tente novamente."
    );
  });
});
