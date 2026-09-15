import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BillingPage from "~/app/dashboard/billing/page";
import { createCheckoutSession, createCustomerPortalSession } from "~/actions/stripe";

vi.mock("~/actions/stripe", () => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  getUserBillingData: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("BillingPage - Redesign com Ancoragem de Preços", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar alternador entre Planos Mensais e Recargas Avulsas", () => {
    render(<BillingPage />);

    const monthlyTab = screen.getByRole("tab", { name: /planos mensais/i });
    const oneTimeTab = screen.getByRole("tab", { name: /recargas avulsas/i });

    expect(monthlyTab).toBeInTheDocument();
    expect(oneTimeTab).toBeInTheDocument();
  });

  it("deve alternar entre as abas e exibir os respectivos cards", () => {
    render(<BillingPage />);

    // Aba inicial: Planos Mensais
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Pro Studio")).toBeInTheDocument();
    expect(screen.queryByText("Small Pack")).not.toBeInTheDocument();

    // Alterna para Recargas Avulsas
    const oneTimeTab = screen.getByRole("tab", { name: /recargas avulsas/i });
    fireEvent.click(oneTimeTab);

    expect(screen.getByText("Small Pack")).toBeInTheDocument();
    expect(screen.getByText("Medium Pack")).toBeInTheDocument();
    expect(screen.getByText("Large Pack")).toBeInTheDocument();
    expect(screen.queryByText("Creator")).not.toBeInTheDocument();

    // Alterna de volta para Planos Mensais
    const monthlyTab = screen.getByRole("tab", { name: /planos mensais/i });
    fireEvent.click(monthlyTab);

    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Pro Studio")).toBeInTheDocument();
    expect(screen.queryByText("Small Pack")).not.toBeInTheDocument();
  });

  it("deve exibir card Pro Studio com ancoragem de preço de $79.99 para $49.99", () => {
    render(<BillingPage />);

    // Verifica card do Pro Studio
    const proStudioTitle = screen.getByText("Pro Studio");
    expect(proStudioTitle).toBeInTheDocument();

    // Preço riscado de ancoragem ($79.99)
    const strikethroughPrice = screen.getByText("$79.99");
    expect(strikethroughPrice).toBeInTheDocument();
    expect(strikethroughPrice.className).toMatch(/line-through/i);

    // Preço promocional ancorado ($49.99)
    expect(screen.getByText("$49.99")).toBeInTheDocument();

    // Badge de economia / desconto
    expect(screen.getByText(/economize 38%/i)).toBeInTheDocument();

    // Selo de Mais Popular
    expect(screen.getByText(/mais popular/i)).toBeInTheDocument();

    // Destaque para fila prioritária GPU Ultra
    expect(screen.getByText(/fila prioritária gpu ultra/i)).toBeInTheDocument();
  });

  it("deve exibir botão de gerenciar assinatura para usuários com assinatura ativa", () => {
    const mockUserWithSubscription = {
      credits: 500,
      subscriptionCredits: 500,
      oneTimeCredits: 0,
      subscription: {
        id: "sub_123",
        plan: "PRO_STUDIO",
        status: "active",
        monthlyCredits: 500,
        currentPeriodStart: new Date("2026-09-01"),
        currentPeriodEnd: new Date("2026-10-01"),
        cancelAtPeriodEnd: false,
      },
    };

    const { rerender } = render(
      <BillingPage user={mockUserWithSubscription} />
    );

    const manageBtn = screen.getByRole("button", {
      name: /gerenciar assinatura/i,
    });
    expect(manageBtn).toBeInTheDocument();

    fireEvent.click(manageBtn);
    expect(createCustomerPortalSession).toHaveBeenCalled();

    // Para usuário sem assinatura ativa, não deve exibir o botão
    rerender(
      <BillingPage
        user={{
          credits: 10,
          subscriptionCredits: 0,
          oneTimeCredits: 10,
          subscription: null,
        }}
      />
    );

    expect(
      screen.queryByRole("button", { name: /gerenciar assinatura/i })
    ).not.toBeInTheDocument();
  });

  it("deve exibir header transparente com saldo total, créditos mensais e avulsos", () => {
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

    // Cota do Mês (Assinatura)
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText(/cota do mês/i)).toBeInTheDocument();

    // Recargas Avulsas (Permanentes)
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("Créditos Avulsos")).toBeInTheDocument();
  });

  it("deve chamar createCheckoutSession com o priceId correto ao assinar ou comprar créditos", () => {
    render(<BillingPage />);

    // Assinar Pro Studio
    const proStudioBtn = screen.getByRole("button", {
      name: /assinar pro studio/i,
    });
    fireEvent.click(proStudioBtn);
    expect(createCheckoutSession).toHaveBeenCalledWith("pro_studio");

    // Assinar Creator
    const creatorBtn = screen.getByRole("button", {
      name: /assinar creator/i,
    });
    fireEvent.click(creatorBtn);
    expect(createCheckoutSession).toHaveBeenCalledWith("creator");

    // Mudar para Recargas Avulsas
    const oneTimeTab = screen.getByRole("tab", { name: /recargas avulsas/i });
    fireEvent.click(oneTimeTab);

    // Comprar 50 créditos
    const buy50Btn = screen.getByRole("button", {
      name: /comprar 50 créditos/i,
    });
    fireEvent.click(buy50Btn);
    expect(createCheckoutSession).toHaveBeenCalledWith("small");
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
            plan: "CREATOR",
            status: "active",
            monthlyCredits: 150,
            currentPeriodStart: new Date("2026-09-01"),
            currentPeriodEnd: new Date("2026-10-01"),
            cancelAtPeriodEnd: true,
          },
        }}
      />
    );

    expect(screen.getAllByText("Creator").length).toBeGreaterThan(0);
    expect(screen.getByText(/cancelamento agendado/i)).toBeInTheDocument();
    expect(screen.getByText(/acesso garantido até/i)).toBeInTheDocument();
  });
});

