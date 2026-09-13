import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonSection } from "~/components/landing/comparison-section";
import { PricingSection } from "~/components/landing/pricing-section";
import { FAQSection } from "~/components/landing/faq-section";
import { Footer } from "~/components/landing/footer";

describe("Landing Conversion Components", () => {
  it("renders ComparisonSection with manual vs clipper comparison", () => {
    render(<ComparisonSection />);
    expect(screen.getByText(/Edição Manual Tradicional/i)).toBeInTheDocument();
    expect(screen.getByText(/Com o Podcast Clipper/i)).toBeInTheDocument();
  });

  it("renders PricingSection with 3 packages and correct pricing", () => {
    render(<PricingSection isAuthenticated={false} />);
    expect(screen.getByText("$9.99")).toBeInTheDocument();
    expect(screen.getByText("$24.99")).toBeInTheDocument();
    expect(screen.getByText("$69.99")).toBeInTheDocument();
    expect(screen.getByText(/Créditos nunca expiram/i)).toBeInTheDocument();
  });

  it("renders FAQSection with answers to common creator questions", () => {
    render(<FAQSection />);
    expect(screen.getByText(/Como funcionam os créditos\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Os créditos expiram se eu não usar este mês\?/i)).toBeInTheDocument();
  });

  it("renders Footer with copyright and status info", () => {
    render(<Footer />);
    expect(screen.getByText(/Podcast Clipper Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Todos os sistemas operacionais/i)).toBeInTheDocument();
  });
});
