import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PricingComparisonTable } from "~/components/landing/pricing-comparison-table";

describe("PricingComparisonTable - Accessibility (WCAG 2.1 AA)", () => {
  it("a tabela tem legenda acessível (WCAG 1.3.1 Info and Relationships)", () => {
    render(<PricingComparisonTable />);
    expect(
      screen.getByRole("table", { name: "Feature comparison by plan" }),
    ).toBeInTheDocument();
  });

  it("os cabeçalhos de plano são columnheader (um por coluna, incluindo Features)", () => {
    render(<PricingComparisonTable />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4);
    expect(headers[0]).toHaveTextContent("Features");
    expect(headers[1]).toHaveTextContent("Starter");
    expect(headers[2]).toHaveTextContent("Pro");
    expect(headers[3]).toHaveTextContent("Enterprise");
  });

  it("o nome de cada funcionalidade é rowheader, para leitores de tela associar a célula", () => {
    render(<PricingComparisonTable />);
    // 4 (Processing) + 5 (AI) + 4 (Export) = 13 funcionalidades
    expect(screen.getAllByRole("rowheader")).toHaveLength(13);
    expect(screen.getByRole("rowheader", { name: "Smart Viral Cuts" })).toBeInTheDocument();
  });

  it("células booleanas (ícone check/traço) têm texto alternativo, não só ícone (WCAG 1.1.1)", () => {
    render(<PricingComparisonTable />);
    const row = screen.getByRole("rowheader", { name: "Auto Thumbnail Generator" }).closest("tr")!;
    const cells = within(row).getAllByRole("cell");

    // Starter = não incluso, Pro = incluso, Enterprise = incluso
    expect(cells[0]).toHaveTextContent("Not included");
    expect(cells[1]).toHaveTextContent("Included");
    expect(cells[2]).toHaveTextContent("Included");
  });

  it("não há células booleanas mudas: todo ícone de check/traço tem texto equivalente", () => {
    const { container } = render(<PricingComparisonTable />);
    const icons = container.querySelectorAll("svg");
    const labelled = screen.getAllByText(/^(Included|Not included)$/);
    // 16 inclusos + 5 não inclusos = 21 células booleanas, cada uma com texto
    expect(labelled).toHaveLength(21);
    expect(icons.length).toBeGreaterThanOrEqual(21);
  });
});
