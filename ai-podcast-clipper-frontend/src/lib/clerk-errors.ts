interface ClerkErrorItem {
  code?: string;
  message?: string;
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
  form_password_length_too_short: "A senha deve conter no mínimo 8 caracteres.",
  form_password_pwned: "Esta senha é muito fraca ou comum. Escolha uma senha mais segura.",
  session_exists: "Já existe uma sessão ativa.",
};

export function formatClerkError(err: unknown): string {
  if (!err) {
    return "Ocorreu um erro ao processar sua solicitação. Tente novamente.";
  }

  const clerkError = err as ClerkErrorLike;

  if (clerkError.errors && Array.isArray(clerkError.errors) && clerkError.errors.length > 0) {
    const firstCode = clerkError.errors[0]?.code;
    if (firstCode && ERROR_TRANSLATIONS[firstCode]) {
      return ERROR_TRANSLATIONS[firstCode];
    }
    if (clerkError.errors[0]?.message) {
      return clerkError.errors[0].message;
    }
  }

  if (typeof clerkError.message === "string" && clerkError.message) {
    return clerkError.message;
  }

  return "Ocorreu um erro ao processar sua solicitação. Tente novamente.";
}
