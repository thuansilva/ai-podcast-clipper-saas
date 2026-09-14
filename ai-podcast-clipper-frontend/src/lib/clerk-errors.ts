interface ClerkErrorItem {
  code?: string;
  message?: string;
  longMessage?: string;
}

interface ClerkErrorLike {
  errors?: ClerkErrorItem[];
  message?: string;
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  form_identifier_not_found: "Conta não encontrada para este email.",
  form_password_incorrect: "Senha incorreta. Verifique suas credenciais e tente novamente.",
  form_identifier_exists: "Este email já está cadastrado. Tente entrar.",
  form_code_incorrect: "Código de verificação incorreto ou expirado.",
  form_password_pwned: "Esta senha é muito fraca ou comum. Escolha uma senha mais segura.",
  form_password_not_strong_enough: "A senha não atende aos requisitos de complexidade. Inclua letras maiúsculas, minúsculas, números e símbolos.",
  form_password_validation_failed: "A senha não atende aos critérios de segurança exigidos.",
  session_exists: "Já existe uma sessão ativa.",
};

export function formatClerkError(err: unknown): string {
  if (!err) {
    return "Ocorreu um erro ao processar sua solicitação. Tente novamente.";
  }

  const clerkError = err as ClerkErrorLike;

  if (clerkError.errors && Array.isArray(clerkError.errors) && clerkError.errors.length > 0) {
    const firstError = clerkError.errors[0];
    const firstCode = firstError?.code;

    // Tratamento dinâmico para tamanho mínimo de senha exigido pelo painel do Clerk
    if (firstCode === "form_password_length_too_short") {
      const msg = firstError?.longMessage ?? firstError?.message ?? "";
      const match = /(\d+)/.exec(msg);
      const minLength = match ? match[1] : "15";
      return `A senha deve conter no mínimo ${minLength} caracteres.`;
    }

    if (firstCode && ERROR_TRANSLATIONS[firstCode]) {
      return ERROR_TRANSLATIONS[firstCode];
    }
    if (firstError?.message) {
      return firstError.message;
    }
  }

  if (typeof clerkError.message === "string" && clerkError.message) {
    return clerkError.message;
  }

  return "Ocorreu um erro ao processar sua solicitação. Tente novamente.";
}
