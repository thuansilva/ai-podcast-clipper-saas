/**
 * Reproduz o bug do checklist-go-live.md: `redirect()` do Next.js App Router,
 * quando chamado dentro de uma Server Action, lança um erro especial
 * (digest "NEXT_REDIRECT;...") que PRECISA propagar para o framework
 * completar a navegação. Um `try/catch` genérico em volta do `await
 * serverAction()` no client engole esse throw como se fosse um erro de
 * aplicação comum, impedindo o redirecionamento (ex: para o Stripe
 * Checkout / portal de cobrança).
 *
 * `handleServerActionError` é o helper que os handlers de client
 * (`billing/page.tsx`, `active-subscription-card.tsx`) devem usar dentro do
 * `catch` para relançar erros de redirect (via `unstable_rethrow`, a API
 * pública do Next.js para esse exato cenário) e só invocar `onError` para
 * falhas reais.
 *
 * Usamos o `redirect()` real de "next/navigation" para gerar o erro — nada
 * de mockar/adivinhar o formato do digest, garantindo fidelidade com o
 * comportamento real do framework.
 */
import { describe, it, expect, vi } from "vitest";
import { redirect } from "next/navigation";
import { handleServerActionError } from "~/lib/handle-server-action-error";

function captureRealNextRedirectError(url: string): unknown {
  try {
    redirect(url);
  } catch (error) {
    return error;
  }
  throw new Error(
    "redirect() não lançou nenhum erro — verifique a versão do Next.js em uso.",
  );
}

describe("handleServerActionError", () => {
  it("relança o erro especial de redirect do Next.js (NEXT_REDIRECT) e NÃO chama onError", () => {
    const redirectError = captureRealNextRedirectError(
      "https://checkout.stripe.com/pay/cs_123",
    );
    const onError = vi.fn();

    expect(() => handleServerActionError(redirectError, onError)).toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  it("chama onError (sem relançar) para um erro de aplicação real, ex: Stripe fora do ar", () => {
    const appError = new Error("Stripe está fora do ar");
    const onError = vi.fn();

    expect(() => handleServerActionError(appError, onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(appError);
  });

  it("chama onError (sem relançar) para um erro de aplicação real, ex: price ID inválido", () => {
    const domainError = new Error("Plano inválido.");
    const onError = vi.fn();

    expect(() => handleServerActionError(domainError, onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(domainError);
  });

  it("chama onError (sem relançar) quando o erro capturado não é um Error (ex: string/undefined)", () => {
    const onError = vi.fn();

    expect(() => handleServerActionError("falha genérica", onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith("falha genérica");

    const onError2 = vi.fn();
    expect(() => handleServerActionError(undefined, onError2)).not.toThrow();
    expect(onError2).toHaveBeenCalledWith(undefined);
  });
});
