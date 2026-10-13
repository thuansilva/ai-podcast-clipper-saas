import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PricingToggleTabs } from "~/components/billing/pricing-toggle-tabs";

describe("PricingToggleTabs - Accessibility (WAI-ARIA tabs pattern)", () => {
  it("roving tabindex: só a aba selecionada entra na ordem de Tab (WCAG 2.1.1)", () => {
    render(<PricingToggleTabs value="monthly" onValueChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: /mensal/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /anual/i })).toHaveAttribute("tabindex", "-1");
  });

  it("setas direita/esquerda trocam a aba e movem o foco (WCAG 2.1.1 Keyboard)", () => {
    const onValueChange = vi.fn();
    render(<PricingToggleTabs value="monthly" onValueChange={onValueChange} />);

    const monthly = screen.getByRole("tab", { name: /mensal/i });
    const annual = screen.getByRole("tab", { name: /anual/i });

    monthly.focus();
    fireEvent.keyDown(monthly, { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenCalledWith("annual");
    expect(annual).toHaveFocus();

    fireEvent.keyDown(annual, { key: "ArrowLeft" });
    expect(onValueChange).toHaveBeenLastCalledWith("monthly");
    expect(monthly).toHaveFocus();
  });
});
