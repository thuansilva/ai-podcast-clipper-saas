import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveSubscriptionCard } from "~/components/billing/active-subscription-card";
import { createCustomerPortalSession } from "~/actions/stripe";
import { toast } from "sonner";
import {
  createNextRedirectError,
  RedirectTestBoundary,
} from "../../mocks/next-redirect-test-helpers";

vi.mock("~/actions/stripe", () => ({
  createCustomerPortalSession: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Reimplementação fiel de `unstable_rethrow` (ver next/dist/client/components/
// unstable-rethrow.ts): relança qualquer erro interno do Next.js identificado
// pelo digest (ex: redirect, notFound) e não faz nada para erros comuns.
// Não pode importar de `../../mocks/next-redirect-test-helpers` aqui
// dentro: fábricas de `vi.mock` são içadas (hoisted) para o topo do
// arquivo, antes de qualquer import de módulo top-level.
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
  },
}));

describe("ActiveSubscriptionCard - enum de planos STARTER/PRO", () => {
  it("deve exibir o label 'Pro' e 300 créditos/mês quando o plano é PRO e monthlyCredits não vem do banco", () => {
    render(
      <ActiveSubscriptionCard
        subscription={{
          id: "sub_123",
          plan: "PRO",
          status: "active",
          monthlyCredits: undefined,
        }}
      />
    );

    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText(/300 créditos\/mês/)).toBeInTheDocument();
  });

  it("deve exibir o label 'Starter' e 150 créditos/mês quando o plano é STARTER e monthlyCredits não vem do banco", () => {
    render(
      <ActiveSubscriptionCard
        subscription={{
          id: "sub_456",
          plan: "STARTER",
          status: "active",
          monthlyCredits: undefined,
        }}
      />
    );

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText(/150 créditos\/mês/)).toBeInTheDocument();
  });
});

describe("ActiveSubscriptionCard - bug do redirect engolido pelo try/catch (handleManage)", () => {
  it("NÃO deve exibir toast de erro quando createCustomerPortalSession lança o erro especial de redirect do Next.js (NEXT_REDIRECT) — deve deixar o redirect propagar em vez de engoli-lo", async () => {
    const redirectError = createNextRedirectError(
      "https://billing.stripe.com/portal/ses_abc",
    );
    (
      createCustomerPortalSession as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(redirectError);

    const onRedirectCaught = vi.fn();

    // O erro de redirect relançado pelo handler precisa ir para algum
    // lugar: em produção é o runtime do App Router que intercepta esse
    // throw (pelo digest) para completar a navegação. Aqui, um boundary
    // dedicado ao teste captura esse throw esperado para o processo de
    // teste continuar limpo — ver `RedirectTestBoundary`.
    render(
      <RedirectTestBoundary onRedirectCaught={onRedirectCaught}>
        <ActiveSubscriptionCard
          subscription={{ id: "sub_123", plan: "PRO", status: "active" }}
        />
      </RedirectTestBoundary>,
    );

    const manageBtn = screen.getByRole("button", {
      name: /gerenciar assinatura/i,
    });
    fireEvent.click(manageBtn);

    await waitFor(() => {
      expect(createCustomerPortalSession).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onRedirectCaught).toHaveBeenCalled();
    });

    // O erro de redirect deve ter propagado (confirmado acima) em vez de
    // ter sido tratado como falha de aplicação.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("deve exibir toast de erro quando createCustomerPortalSession falha por um motivo real (ex: Stripe fora do ar)", async () => {
    (
      createCustomerPortalSession as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Stripe está fora do ar"));

    render(
      <ActiveSubscriptionCard
        subscription={{ id: "sub_123", plan: "PRO", status: "active" }}
      />,
    );

    const manageBtn = screen.getByRole("button", {
      name: /gerenciar assinatura/i,
    });
    fireEvent.click(manageBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Erro ao acessar o portal de faturamento. Tente novamente.",
      );
    });
  });
});
