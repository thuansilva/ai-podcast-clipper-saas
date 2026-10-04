import * as React from "react";

/**
 * Gera um erro com o mesmo formato de digest que o `redirect()` real do
 * Next.js App Router lança dentro de uma Server Action
 * (`NEXT_REDIRECT;{push|replace};{url};{status};`).
 *
 * Usado para reproduzir, em testes de componente, o bug em que um
 * `try/catch` genérico em volta de `await serverAction()` engolia esse
 * throw especial (ver checklist-go-live.md) em vez de deixá-lo propagar.
 */
export function createNextRedirectError(url: string): Error & { digest: string } {
  const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;push;${url};307;`;
  return error;
}

// Nota: a reimplementação de `unstable_rethrow` usada para mockar
// `next/navigation` fica duplicada inline em cada arquivo de teste que
// precisa dela (em vez de importada daqui), porque fábricas de
// `vi.mock(...)` são içadas (hoisted) para o topo do arquivo pelo Vitest,
// antes de qualquer import de módulo top-level — importar uma função
// definida em outro arquivo e usá-la dentro da fábrica dispara
// "Cannot access '...' before initialization".

function isNextRedirectDigestError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

interface RedirectTestBoundaryProps {
  children: React.ReactNode;
  onRedirectCaught: () => void;
}

/**
 * Error Boundary só para teste: quando o fix está correto, o erro de
 * redirect relançado pelo handler do client (`handleCheckout`/
 * `handleManage`) precisa ir para algum lugar — em produção, o runtime do
 * App Router do Next.js intercepta esse throw pelo digest e completa a
 * navegação. Em um teste de componente isolado (sem o App Router real
 * renderizado), nada capturaria esse throw, o que faria o processo de
 * teste reportar uma "Uncaught Exception" (ruído, apesar do
 * comportamento estar correto). Este boundary captura esse throw
 * esperado (e só esse — qualquer outro erro continua propagando) para
 * manter o teste limpo, chamando `onRedirectCaught` para a asserção
 * poder confirmar que o redirect realmente propagou em vez de ter sido
 * engolido/transformado em toast.
 */
export class RedirectTestBoundary extends React.Component<RedirectTestBoundaryProps> {
  static getDerivedStateFromError(error: unknown) {
    if (isNextRedirectDigestError(error)) {
      return {};
    }
    throw error;
  }

  componentDidCatch(error: unknown) {
    if (isNextRedirectDigestError(error)) {
      this.props.onRedirectCaught();
    }
  }

  render() {
    return this.props.children;
  }
}
