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
