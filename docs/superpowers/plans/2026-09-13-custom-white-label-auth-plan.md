# Autenticação White-Label Customizada e Menu do Usuário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os componentes pré-fabricados do Clerk (`<SignIn />`, `<SignUp />` e `<UserButton />`) por formulários e menus 100% proprietários (*white-label*) baseados nos hooks oficiais do Clerk (`useSignIn`, `useSignUp`, `useUser`, `useClerk`), garantindo total aderência ao design system *Dark Precision Studio* e eliminando qualquer menção visual ao Clerk.

**Architecture:** A camada de apresentação React implementa formulários puros com Tailwind CSS, Radix UI (`DropdownMenu`, `Avatar`) e ícones Lucide. As requisições de autenticação e sessão são orquestradas invisivelmente pelos hooks do Clerk no client-side (`useSignIn`, `useSignUp`, `useUser`, `useClerk`), com redirecionamentos seguros para `/dashboard` e rota técnica de callback OAuth em `/sso-callback`. Erros retornados pelo Clerk são traduzidos para mensagens amigáveis em português do Brasil.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Radix UI (`@radix-ui/react-dropdown-menu`, `@radix-ui/react-avatar`), Lucide Icons, `@clerk/nextjs` (Hooks & Auth Callback).

**Spec:** `docs/superpowers/specs/2026-09-13-custom-white-label-auth-design.md`

## Global Constraints

- **Design System:** Linguagem *Dark Precision Studio* (Anti-IA) com tokens CSS (`var(--tinta)`, `var(--superficie)`, `var(--superficie-2)`, `var(--ouro)`, `var(--marfim)`, `var(--linha)`, etc.). Proibido uso de gradientes roxos/azuis neon ou orbes blur.
- **Microcopy:** Todos os textos, botões, rótulos e mensagens de erro em Português do Brasil (pt-BR).
- **White-Label:** Nenhuma marca, badge ("Secured by Clerk") ou componente de apresentação padrão do Clerk pode ser visível ao usuário.
- **Regra do Projeto (AGENTS.md):** NUNCA execute `git commit` ou `git push` sem autorização explícita do usuário. Mantenha os arquivos no working directory para revisão.

---

### Task 1: Mapeamento e Tradução de Erros do Clerk (`clerk-errors.ts`)

**Files:**
- Create: `src/lib/clerk-errors.ts`
- Test: `tests/unit/lib/clerk-errors.test.ts`

**Interfaces:**
- Produces: `formatClerkError(error: unknown): string`

- [ ] **Step 1: Escrever teste unitário com falha (RED)**

Criar `tests/unit/lib/clerk-errors.test.ts`:
```ts
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
    const error = {
      errors: [{ code: "form_password_length_too_short", message: "Password is too short." }],
    };
    expect(formatClerkError(error)).toBe("A senha deve conter no mínimo 8 caracteres.");
  });

  it("deve retornar mensagem genérica caso não haja código conhecido", () => {
    expect(formatClerkError(null)).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
    expect(formatClerkError({})).toBe("Ocorreu um erro ao processar sua solicitação. Tente novamente.");
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**
```bash
npm run test tests/unit/lib/clerk-errors.test.ts
```

- [ ] **Step 3: Implementar `src/lib/clerk-errors.ts`**

Criar `src/lib/clerk-errors.ts`:
```ts
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
```

- [ ] **Step 4: Executar teste para verificar aprovação (GREEN)**
```bash
npm run test tests/unit/lib/clerk-errors.test.ts
```

---

### Task 2: Formulário Customizado de Login (`CustomSignInForm`) e Atualização de `/login`

**Files:**
- Create: `src/components/auth/custom-sign-in-form.tsx`
- Modify: `src/app/login/[[...login]]/page.tsx`
- Test: `tests/unit/components/custom-sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `formatClerkError` de `~/lib/clerk-errors`, `useSignIn` de `@clerk/nextjs`
- Produces: `<CustomSignInForm />`

- [ ] **Step 1: Escrever teste unitário com falha (RED)**

Criar `tests/unit/components/custom-sign-in-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomSignInForm } from "~/components/auth/custom-sign-in-form";

const mockSignInCreate = vi.fn();
const mockAuthenticateWithRedirect = vi.fn();
const mockSetActive = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      authenticateWithRedirect: mockAuthenticateWithRedirect,
    },
    setActive: mockSetActive,
  }),
}));

describe("CustomSignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar campos de email, senha, botão de login e botão do Google", () => {
    render(<CustomSignInForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar com google/i })).toBeInTheDocument();
    expect(screen.getByText(/não tem uma conta/i)).toBeInTheDocument();
  });

  it("deve submeter credenciais e redirecionar para dashboard em caso de sucesso", async () => {
    mockSignInCreate.mockResolvedValueOnce({
      status: "complete",
      createdSessionId: "sess_123",
    });

    render(<CustomSignInForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar no studio/i }));

    await waitFor(() => {
      expect(mockSignInCreate).toHaveBeenCalledWith({
        identifier: "user@example.com",
        password: "password123",
      });
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_123" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("deve disparar OAuth com Google ao clicar no botão correspondente", async () => {
    render(<CustomSignInForm />);

    fireEvent.click(screen.getByRole("button", { name: /continuar com google/i }));

    await waitFor(() => {
      expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    });
  });

  it("deve exibir mensagem de erro traduzida caso as credenciais falhem", async () => {
    mockSignInCreate.mockRejectedValueOnce({
      errors: [{ code: "form_password_incorrect" }],
    });

    render(<CustomSignInForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar no studio/i }));

    await waitFor(() => {
      expect(screen.getByText(/senha incorreta/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**
```bash
npm run test tests/unit/components/custom-sign-in-form.test.tsx
```

- [ ] **Step 3: Implementar `src/components/auth/custom-sign-in-form.tsx`**

Criar `src/components/auth/custom-sign-in-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { formatClerkError } from "~/lib/clerk-errors";

export function CustomSignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setErrorMessage("Autenticação não concluída. Verifique suas informações.");
      }
    } catch (err) {
      setErrorMessage(formatClerkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isLoaded || !signIn) return;
    setIsGoogleLoading(true);
    setErrorMessage(null);

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err) {
      setErrorMessage(formatClerkError(err));
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="space-y-2 text-left">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--marfim)]">
          Acessar sua conta
        </h2>
        <p className="text-sm text-[var(--fumaca)]">
          Entre com seu email e senha ou use sua conta Google.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading || isLoading}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-[var(--linha)] bg-[var(--tinta)] hover:bg-[var(--superficie-2)] text-[var(--marfim)] text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ouro)]" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>Continuar com Google</span>
      </button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-[var(--linha)]" />
        <span className="absolute bg-[var(--superficie)] px-3 text-[11px] font-medium tracking-wider uppercase text-[var(--fumaca)]">
          ou continue com email
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="email"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--marfim-2)]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            disabled={isLoading}
            className="w-full rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 text-sm text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5 text-left">
          <label
            htmlFor="password"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--marfim-2)]"
          >
            Senha
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className="w-full rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 pr-10 text-sm text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || isGoogleLoading}
          className="btn-ouro !w-full !py-2.5 !text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Entrando...</span>
            </>
          ) : (
            <span>Entrar no Studio</span>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="text-center pt-2">
        <p className="text-xs text-[var(--fumaca)]">
          Não tem uma conta?{" "}
          <Link
            href="/signup"
            className="text-[var(--ouro)] font-medium hover:underline underline-offset-4"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Atualizar `src/app/login/[[...login]]/page.tsx`**

Substituir `<SignIn />` por `<CustomSignInForm />` dentro de `AuthSplitLayout`:
```tsx
import { CustomSignInForm } from "~/components/auth/custom-sign-in-form";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

export default function LoginPage() {
  return (
    <AuthSplitLayout
      title="Bem-vindo de volta ao Studio"
      subtitle="Acesse sua conta para continuar criando, personalizando e exportando seus cortes virais."
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <CustomSignInForm />
      </div>
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 5: Executar teste para verificar aprovação (GREEN)**
```bash
npm run test tests/unit/components/custom-sign-in-form.test.tsx
```

---

### Task 3: Formulário Customizado de Cadastro com OTP (`CustomSignUpForm`) e Atualização de `/signup`

**Files:**
- Create: `src/components/auth/custom-sign-up-form.tsx`
- Modify: `src/app/signup/[[...signup]]/page.tsx`
- Test: `tests/unit/components/custom-sign-up-form.test.tsx`

**Interfaces:**
- Consumes: `formatClerkError` de `~/lib/clerk-errors`, `useSignUp` de `@clerk/nextjs`
- Produces: `<CustomSignUpForm />`

- [ ] **Step 1: Escrever teste unitário com falha (RED)**

Criar `tests/unit/components/custom-sign-up-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomSignUpForm } from "~/components/auth/custom-sign-up-form";

const mockSignUpCreate = vi.fn();
const mockPrepareVerification = vi.fn();
const mockAttemptVerification = vi.fn();
const mockAuthenticateWithRedirect = vi.fn();
const mockSetActive = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockSignUpCreate,
      prepareEmailAddressVerification: mockPrepareVerification,
      attemptEmailAddressVerification: mockAttemptVerification,
      authenticateWithRedirect: mockAuthenticateWithRedirect,
    },
    setActive: mockSetActive,
  }),
}));

describe("CustomSignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar campos de email, senha, botão de cadastro e botão do Google", () => {
    render(<CustomSignUpForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /criar conta no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cadastrar com google/i })).toBeInTheDocument();
    expect(screen.getByText(/já tem uma conta/i)).toBeInTheDocument();
  });

  it("deve submeter dados e avançar para etapa de verificação de código", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});

    render(<CustomSignUpForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(mockSignUpCreate).toHaveBeenCalledWith({
        emailAddress: "newuser@example.com",
        password: "password123",
      });
      expect(mockPrepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
      expect(screen.getByText(/verifique seu email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });
  });

  it("deve validar código de 6 dígitos e autenticar com sucesso", async () => {
    mockSignUpCreate.mockResolvedValueOnce({});
    mockPrepareVerification.mockResolvedValueOnce({});
    mockAttemptVerification.mockResolvedValueOnce({
      status: "complete",
      createdSessionId: "sess_new_123",
    });

    render(<CustomSignUpForm />);

    // Avança para etapa 2
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newuser@example.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar conta no studio/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código de verificação/i)).toBeInTheDocument();
    });

    // Digita o código e confirma
    fireEvent.change(screen.getByLabelText(/código de verificação/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar e acessar/i }));

    await waitFor(() => {
      expect(mockAttemptVerification).toHaveBeenCalledWith({ code: "123456" });
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_new_123" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("deve disparar OAuth com Google no cadastro", async () => {
    render(<CustomSignUpForm />);

    fireEvent.click(screen.getByRole("button", { name: /cadastrar com google/i }));

    await waitFor(() => {
      expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    });
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**
```bash
npm run test tests/unit/components/custom-sign-up-form.test.tsx
```

- [ ] **Step 3: Implementar `src/components/auth/custom-sign-up-form.tsx`**

Criar `src/components/auth/custom-sign-up-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { formatClerkError } from "~/lib/clerk-errors";

export function CustomSignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verifying">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verifying");
    } catch (err) {
      setErrorMessage(formatClerkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === "complete") {
        await setActive({ session: completeSignUp.createdSessionId });
        router.push("/dashboard");
      } else {
        setErrorMessage("Não foi possível concluir o cadastro. Verifique o código digitado.");
      }
    } catch (err) {
      setErrorMessage(formatClerkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;
    setErrorMessage(null);
    setResendSuccess(false);

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 4000);
    } catch (err) {
      setErrorMessage(formatClerkError(err));
    }
  };

  const handleGoogleSignUp = async () => {
    if (!isLoaded || !signUp) return;
    setIsGoogleLoading(true);
    setErrorMessage(null);

    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err) {
      setErrorMessage(formatClerkError(err));
      setIsGoogleLoading(false);
    }
  };

  if (step === "verifying") {
    return (
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="space-y-2 text-left">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--tinta)] shadow-[0_0_12px_rgba(232,186,82,0.15)] mb-2">
            <Mail className="h-5 w-5 text-[var(--ouro)]" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--marfim)]">
            Verifique seu email
          </h2>
          <p className="text-sm text-[var(--fumaca)] leading-relaxed">
            Enviamos um código de verificação para <strong className="text-[var(--marfim)]">{email}</strong>. Digite-o abaixo para ativar sua conta.
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {resendSuccess && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            Novo código de verificação enviado para seu email!
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="code"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--marfim-2)]"
            >
              Código de verificação
            </label>
            <input
              id="code"
              type="text"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="123456"
              disabled={isLoading}
              className="w-full font-mono text-center tracking-widest text-lg rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || code.length < 6}
            className="btn-ouro !w-full !py-2.5 !text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Confirmando...</span>
              </>
            ) : (
              <span>Confirmar e acessar</span>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--linha)] text-xs text-[var(--fumaca)]">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="flex items-center gap-1 hover:text-[var(--marfim)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Editar email</span>
          </button>
          <button
            type="button"
            onClick={handleResendCode}
            className="text-[var(--ouro)] hover:underline underline-offset-4 cursor-pointer"
          >
            Reenviar código
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="space-y-2 text-left">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--marfim)]">
          Criar sua conta Studio
        </h2>
        <p className="text-sm text-[var(--fumaca)]">
          Comece com 10 créditos gratuitos para gerar seus primeiros cortes virais.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignUp}
        disabled={isGoogleLoading || isLoading}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-[var(--linha)] bg-[var(--tinta)] hover:bg-[var(--superficie-2)] text-[var(--marfim)] text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ouro)]" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>Cadastrar com Google</span>
      </button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-[var(--linha)]" />
        <span className="absolute bg-[var(--superficie)] px-3 text-[11px] font-medium tracking-wider uppercase text-[var(--fumaca)]">
          ou cadastre-se com email
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-email"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--marfim-2)]"
          >
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            disabled={isLoading}
            className="w-full rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 text-sm text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5 text-left">
          <label
            htmlFor="signup-password"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--marfim-2)]"
          >
            Senha
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
              disabled={isLoading}
              className="w-full rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 pr-10 text-sm text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || isGoogleLoading}
          className="btn-ouro !w-full !py-2.5 !text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Criando conta...</span>
            </>
          ) : (
            <span>Criar conta no Studio</span>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="text-center pt-2">
        <p className="text-xs text-[var(--fumaca)]">
          Já tem uma conta?{" "}
          <Link
            href="/login"
            className="text-[var(--ouro)] font-medium hover:underline underline-offset-4"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Atualizar `src/app/signup/[[...signup]]/page.tsx`**

Substituir `<SignUp />` por `<CustomSignUpForm />` dentro de `AuthSplitLayout`:
```tsx
import { CustomSignUpForm } from "~/components/auth/custom-sign-up-form";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

export default function SignUpPage() {
  return (
    <AuthSplitLayout
      title="Crie sua conta no Studio"
      subtitle="Comece com 10 minutos gratuitos. Envie seu episódio e gere seus primeiros clipes virais em minutos."
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <CustomSignUpForm />
      </div>
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 5: Executar teste para verificar aprovação (GREEN)**
```bash
npm run test tests/unit/components/custom-sign-up-form.test.tsx
```

---

### Task 4: Rota de Retorno OAuth (`src/app/sso-callback/page.tsx`)

**Files:**
- Create: `src/app/sso-callback/page.tsx`
- Test: `tests/unit/sso-callback-page.test.tsx`

**Interfaces:**
- Consumes: `<AuthenticateWithRedirectCallback />` de `@clerk/nextjs`
- Produces: Rota técnica Next.js `/sso-callback`

- [ ] **Step 1: Escrever teste unitário com falha (RED)**

Criar `tests/unit/sso-callback-page.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SSOCallbackPage from "~/app/sso-callback/page";

vi.mock("@clerk/nextjs", () => ({
  AuthenticateWithRedirectCallback: vi.fn(() => (
    <div data-testid="clerk-sso-callback">Redirecting...</div>
  )),
}));

describe("SSOCallbackPage", () => {
  it("deve renderizar a tela de callback com estilo Dark Precision Studio", () => {
    render(<SSOCallbackPage />);

    expect(screen.getByTestId("clerk-sso-callback")).toBeInTheDocument();
    expect(screen.getByText(/autenticando com google/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**
```bash
npm run test tests/unit/sso-callback-page.test.tsx
```

- [ ] **Step 3: Implementar `src/app/sso-callback/page.tsx`**

Criar `src/app/sso-callback/page.tsx`:
```tsx
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Sparkles, Loader2 } from "lucide-react";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--tinta)] text-[var(--marfim)] p-4">
      <div className="relative flex flex-col items-center space-y-4 rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-8 text-center shadow-[0_0_40px_rgba(0,0,0,0.8)] max-w-sm w-full">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--tinta)] shadow-[0_0_15px_rgba(232,186,82,0.2)]">
          <Sparkles className="h-6 w-6 text-[var(--ouro)] animate-pulse" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--marfim)]">
            Autenticando com Google...
          </h2>
          <p className="text-xs text-[var(--fumaca)]">
            Finalizando sua sessão segura no Studio. Aguarde um instante.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2 text-xs font-mono text-[var(--ouro)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Validando credenciais</span>
        </div>

        <div className="sr-only">
          <AuthenticateWithRedirectCallback />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Executar teste para verificar aprovação (GREEN)**
```bash
npm run test tests/unit/sso-callback-page.test.tsx
```

---

### Task 5: Menu do Usuário White-Label (`UserNavMenu`) e Atualização do `NavHeader`

**Files:**
- Create: `src/components/user-nav-menu.tsx`
- Modify: `src/components/nav-header.tsx`
- Test: `tests/unit/components/user-nav-menu.test.tsx`

**Interfaces:**
- Consumes: `useUser`, `useClerk` de `@clerk/nextjs`, `DropdownMenu` e `Avatar` de `~/components/ui`
- Produces: `<UserNavMenu />`

- [ ] **Step 1: Escrever teste unitário com falha (RED)**

Criar `tests/unit/components/user-nav-menu.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserNavMenu } from "~/components/user-nav-menu";

const mockSignOut = vi.fn((cb) => cb && cb());
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Thuan Silva",
      primaryEmailAddress: { emailAddress: "thuan@example.com" },
      imageUrl: "https://example.com/photo.jpg",
    },
  }),
  useClerk: () => ({
    signOut: mockSignOut,
  }),
}));

describe("UserNavMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar o avatar com foto ou iniciais", () => {
    render(<UserNavMenu />);

    const trigger = screen.getByRole("button");
    expect(trigger).toBeInTheDocument();
  });

  it("deve abrir menu com nome, email, link de faturamento e botão de logout", async () => {
    render(<UserNavMenu />);

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    expect(screen.getByText("Thuan Silva")).toBeInTheDocument();
    expect(screen.getByText("thuan@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /faturamento/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sair da conta/i })).toBeInTheDocument();
  });

  it("deve chamar signOut e redirecionar para a landing page ao clicar em sair", async () => {
    render(<UserNavMenu />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: /sair da conta/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**
```bash
npm run test tests/unit/components/user-nav-menu.test.tsx
```

- [ ] **Step 3: Implementar `src/components/user-nav-menu.tsx`**

Criar `src/components/user-nav-menu.tsx`:
```tsx
"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

export function UserNavMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  if (!isLoaded || !user) {
    return (
      <div className="h-8 w-8 rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)] animate-pulse" />
    );
  }

  const displayName = user.fullName || "Usuário Studio";
  const email = user.primaryEmailAddress?.emailAddress || "";
  const initials = (user.fullName || email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleSignOut = () => {
    signOut(() => {
      router.push("/");
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do usuário"
          className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[var(--linha-2)] bg-[var(--superficie)] hover:border-[var(--ouro)]/60 transition-colors focus:outline-none cursor-pointer"
        >
          <Avatar className="h-8 w-8">
            {user.imageUrl && <AvatarImage src={user.imageUrl} alt={displayName} />}
            <AvatarFallback className="bg-[var(--superficie-2)] font-mono text-xs text-[var(--ouro)]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] text-[var(--marfim)] shadow-[0_4px_24px_rgba(0,0,0,0.6)] p-1.5"
      >
        <DropdownMenuLabel className="font-normal p-2.5">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-[var(--marfim)]">
              {displayName}
            </p>
            <p className="text-xs leading-none text-[var(--fumaca)] font-mono truncate">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[var(--linha)]" />
        <DropdownMenuItem asChild className="focus:bg-[var(--superficie-2)] focus:text-[var(--marfim)] cursor-pointer rounded-lg p-2 text-xs">
          <Link href="/dashboard/billing" className="flex items-center gap-2.5">
            <CreditCard className="size-4 text-[var(--ouro)]" />
            <span>Faturamento & Créditos</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[var(--linha)]" />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="focus:bg-red-500/10 focus:text-red-400 text-red-400 cursor-pointer rounded-lg p-2 text-xs flex items-center gap-2.5"
        >
          <LogOut className="size-4" />
          <span>Sair da conta</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Atualizar `src/components/nav-header.tsx`**

Substituir `<UserButton />` por `<UserNavMenu />`:
```tsx
// Substituir import:
// import { UserButton } from "@clerk/nextjs";
import { UserNavMenu } from "./user-nav-menu";

// No JSX (linhas 46-54):
// Substituir <UserButton>...</UserButton> por:
<UserNavMenu />
```

- [ ] **Step 5: Executar teste para verificar aprovação (GREEN)**
```bash
npm run test tests/unit/components/user-nav-menu.test.tsx
```

---

### Task 6: Atualização dos Testes Existentes e Verificação Completa

**Files:**
- Modify: `tests/unit/auth-pages.test.tsx`

- [ ] **Step 1: Atualizar `tests/unit/auth-pages.test.tsx`**

Atualizar o teste para validar a renderização dos nossos componentes customizados (`CustomSignInForm` e `CustomSignUpForm`):
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "~/app/login/[[...login]]/page";
import SignUpPage from "~/app/signup/[[...signup]]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: vi.fn(),
      prepareEmailAddressVerification: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
      authenticateWithRedirect: vi.fn(),
    },
    setActive: vi.fn(),
  }),
}));

describe("Auth Pages", () => {
  it("renders LoginPage within AuthSplitLayout with CustomSignInForm", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /entrar no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar com google/i })).toBeInTheDocument();
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getByText("Bem-vindo de volta ao Studio")).toBeInTheDocument();
  });

  it("renders SignUpPage within AuthSplitLayout with CustomSignUpForm", () => {
    render(<SignUpPage />);
    expect(screen.getByRole("button", { name: /criar conta no studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cadastrar com google/i })).toBeInTheDocument();
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getByText("Crie sua conta no Studio")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Executar suite de testes e checagem de tipos**
```bash
npm run check
npm run test:all
```

- [ ] **Step 3: Apresentar resultados para o usuário e solicitar autorização de commit (AGENTS.md)**
