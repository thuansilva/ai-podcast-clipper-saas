import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FAQSection } from "~/components/landing/faq-section";

describe("FAQSection - Accessibility (WCAG 2.1 AA)", () => {
  it("cada pergunta controla um painel existente via aria-controls (WCAG 4.1.2)", () => {
    render(<FAQSection />);
    const trigger = screen.getByRole("button", { name: "How do processing credits work?" });

    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent("1 credit equals 1 minute");
  });

  it("o painel é uma região rotulada pela pergunta que o controla", () => {
    render(<FAQSection />);
    const trigger = screen.getByRole("button", { name: "How do processing credits work?" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;

    expect(panel).toHaveAttribute("role", "region");
    expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
    expect(trigger.id).toBeTruthy();
  });

  it("painel fechado continua no DOM (oculto) para que aria-controls sempre aponte para algo", () => {
    render(<FAQSection />);
    const closed = screen.getByRole("button", { name: "Do my credits ever expire?" });
    expect(closed).toHaveAttribute("aria-expanded", "false");

    const panel = document.getElementById(closed.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();

    fireEvent.click(closed);
    expect(closed).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
  });
});
