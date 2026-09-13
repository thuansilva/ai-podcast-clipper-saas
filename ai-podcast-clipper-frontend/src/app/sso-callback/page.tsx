import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Sparkles, Loader2 } from "lucide-react";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--tinta)] p-4 text-[var(--marfim)]">
      <div className="relative flex w-full max-w-sm flex-col items-center space-y-4 rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-8 text-center shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--ouro)]/40 bg-[var(--tinta)] shadow-[0_0_15px_rgba(232,186,82,0.2)]">
          <Sparkles className="h-6 w-6 animate-pulse text-[var(--ouro)]" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--marfim)]">
            Autenticando com Google...
          </h2>
          <p className="text-xs text-[var(--fumaca)]">
            Finalizando sua sessão segura no Studio. Aguarde um instante.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2 font-mono text-xs text-[var(--ouro)]">
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
