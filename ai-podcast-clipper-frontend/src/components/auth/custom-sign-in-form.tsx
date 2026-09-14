"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { formatClerkError } from "~/lib/clerk-errors";
import { signInSchema } from "~/domain/rules/auth-schemas";

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

    setErrorMessage(null);

    const validation = signInSchema.safeParse({ email, password });
    if (!validation.success) {
      setErrorMessage(
        validation.error.errors[0]?.message ?? "Dados de entrada inválidos.",
      );
      return;
    }

    setIsLoading(true);

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
      console.error("[Clerk SignIn Error]:", err);
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
      console.error("[Clerk Google SignIn Error]:", err);
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
