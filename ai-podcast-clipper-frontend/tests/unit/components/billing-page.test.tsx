import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BillingPage from "~/app/dashboard/billing/page";
import { createCheckoutSession, createCustomerPortalSession } from "~/actions/stripe";
import { toast } from "sonner";
import {
  createNextRedirectError,
  RedirectTestBoundary,
} from "../../mocks/next-redirect-test-helpers";

vi.mock("~/actions/stripe", () => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  getUserBillingData: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Este teste mocka `next/navigation` por completo (para controlar
// useRouter/useSearchParams), por isso precisa preservar aqui o
// comportamento real de `unstable_rethrow` — é essa função que o
// componente usa para não engolir o throw especial de `redirect()`.
// Não pode importar de `../../mocks/next-redirect-test-helpers` aqui
// dentro: fábricas de `vi.mock` são içadas (hoisted) para o topo do
// arquivo, antes de qualquer import de módulo top-level.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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

describe("BillingPage - Mensal vs Anual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar alternador entre Mensal e Anual", () => {
    render(<BillingPage />);

    const monthlyTab = screen.getByRole("tab", { name: /mensal/i });
    const annualTab = screen.getByRole("tab", { name: /anual/i });

    expect(monthlyTab).toBeInTheDocument();
    expect(annualTab).toBeInTheDocument();
  });

  it("deve exibir header transparente com saldo total e cota de assinatura", () => {
    render(
      <BillingPage
        user={{
          credits: 220,
          subscriptionCredits: 150,
          oneTimeCredits: 70,
          subscription: null,
        }}
      />
    );

    // Saldo Total
    expect(screen.getByText("220")).toBeInTheDocument();
    expect(screen.getByText(/saldo total/i)).toBeInTheDocument();

    // Cota de Assinatura
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText(/cota de assinatura/i)).toBeInTheDocument();
  });

  it("deve chamar createCheckoutSession com o priceId correto ao assinar mensalmente", () => {
    render(<BillingPage />);

    // Assinar Pro Mensal
    const proBtn = screen.getByRole("button", {
      name: /assinar pro/i,
    });
    fireEvent.click(proBtn);
    expect(createCheckoutSession).toHaveBeenCalledWith("pro_monthly");
  });

  it("deve chamar createCheckoutSession com o priceId correto ao assinar anualmente", () => {
    render(<BillingPage />);

    // Alterna para Anual
    const annualTab = screen.getByRole("tab", { name: /anual/i });
    fireEvent.click(annualTab);

    // Assinar Pro Anual
    const proBtn = screen.getByRole("button", {
      name: /assinar pro/i,
    });
    fireEvent.click(proBtn);
    expect(createCheckoutSession).toHaveBeenCalledWith("pro_annual");
  });

  it("NÃO deve exibir toast de erro quando createCheckoutSession lança o erro especial de redirect do Next.js (NEXT_REDIRECT) — deve deixar o redirect propagar em vez de engoli-lo", async () => {
    const redirectError = createNextRedirectError(
      "https://checkout.stripe.com/pay/cs_123",
    );
    (createCheckoutSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      redirectError,
    );

    const onRedirectCaught = vi.fn();

    // O erro de redirect relançado pelo handler precisa ir para algum
    // lugar: em produção é o runtime do App Router que intercepta esse
    // throw (pelo digest) para completar a navegação. Aqui, um boundary
    // dedicado ao teste captura esse throw esperado para o processo de
    // teste continuar limpo — ver `RedirectTestBoundary`.
    render(
      <RedirectTestBoundary onRedirectCaught={onRedirectCaught}>
        <BillingPage />
      </RedirectTestBoundary>,
    );

    const proBtn = screen.getByRole("button", { name: /assinar pro/i });
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(createCheckoutSession).toHaveBeenCalledWith("pro_monthly");
    });

    await waitFor(() => {
      expect(onRedirectCaught).toHaveBeenCalled();
    });

    // O erro de redirect deve ter propagado (confirmado acima) em vez de
    // ter sido tratado como falha de aplicação.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("deve exibir toast de erro quando createCheckoutSession falha por um motivo real (ex: Stripe fora do ar)", async () => {
    (createCheckoutSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Stripe está fora do ar"),
    );

    render(<BillingPage />);

    const proBtn = screen.getByRole("button", { name: /assinar pro/i });
    fireEvent.click(proBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Erro ao iniciar sessão de checkout. Tente novamente.",
      );
    });
  });

  it("deve renderizar ActiveSubscriptionCard com aviso de cancelamento agendado", () => {
    render(
      <BillingPage
        user={{
          credits: 150,
          subscriptionCredits: 150,
          oneTimeCredits: 0,
          subscription: {
            id: "sub_456",
            plan: "STARTER",
            status: "active",
            monthlyCredits: 150,
            currentPeriodStart: new Date("2026-09-01"),
            currentPeriodEnd: new Date("2026-10-01"),
            cancelAtPeriodEnd: true,
          },
        }}
      />
    );

    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getByText(/cancelamento agendado/i)).toBeInTheDocument();
    expect(screen.getByText(/acesso garantido até/i)).toBeInTheDocument();
  });
});
