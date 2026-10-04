import { unstable_rethrow } from "next/navigation";

/**
 * Trata erros capturados no `catch` de um handler de client que chama uma
 * Server Action.
 *
 * No Next.js App Router, `redirect()` chamado dentro de uma Server Action
 * lança um erro especial (digest no formato `NEXT_REDIRECT;{push|replace};
 * {url};{status}`) que PRECISA propagar até o framework para completar a
 * navegação (ex: redirecionar para o Stripe Checkout/portal de cobrança).
 * Um `try/catch` genérico em volta do `await serverAction()` no client
 * engoliria esse throw como se fosse um erro de aplicação comum, exibindo
 * um toast de erro e impedindo o redirecionamento.
 *
 * Use esta função dentro do `catch`: ela relança erros internos do
 * Next.js (redirect, notFound, etc.) via `unstable_rethrow` — a API
 * pública do framework para esse exato cenário — e só invoca `onError`
 * para falhas reais de aplicação (ex: Stripe fora do ar, price ID
 * inválido).
 */
export function handleServerActionError(
  error: unknown,
  onError: (error: unknown) => void,
): void {
  unstable_rethrow(error);
  onError(error);
}
