"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { formatClerkError } from "~/lib/clerk-errors";
import { signUpSchema, verifyCodeSchema } from "~/domain/rules/auth-schemas";

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

    setErrorMessage(null);

    const validation = signUpSchema.safeParse({ email, password });
    if (!validation.success) {
      setErrorMessage(
        validation.error.errors[0]?.message ?? "Dados de cadastro inválidos.",
      );
      return;
    }

    setIsLoading(true);

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verifying");
    } catch (err) {
      console.error("[Clerk SignUp Error]:", err);
      setErrorMessage(formatClerkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setErrorMessage(null);

    const validation = verifyCodeSchema.safeParse({ code });
    if (!validation.success) {
      setErrorMessage(
        validation.error.errors[0]?.message ?? "Código de verificação inválido.",
      );
      return;
    }

    setIsLoading(true);

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
      console.error("[Clerk Verify Error]:", err);
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
      console.error("[Clerk Resend Error]:", err);
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
      console.error("[Clerk Google SignUp Error]:", err);
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
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
            autoComplete="username"
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
              autoComplete="new-password"
              minLength={15}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              disabled={isLoading}
              className="w-full rounded-lg border border-[var(--linha)] bg-[var(--tinta)] px-3 py-2 pr-10 text-sm text-[var(--marfim)] placeholder:text-[var(--fumaca)] transition-colors focus:border-[var(--ouro)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Alternar visibilidade"
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
