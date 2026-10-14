import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsedRangesTrack } from "~/components/dashboard/used-ranges-track";

describe("UsedRangesTrack - Accessibility (WCAG 2.1 AA)", () => {
  it("a informação dos trechos usados não depende só de cor/posição: a lista textual fica acessível (WCAG 1.4.1 Uso de cor)", () => {
    render(<UsedRangesTrack usedRanges={[{ start: 10, end: 20 }, { start: 60, end: 90 }]} max={120} />);

    const text = screen.getByText(/00:10–00:20, 01:00–01:30/);
    expect(text).toBeInTheDocument();
    // O texto NÃO pode estar escondido da árvore de acessibilidade.
    expect(text.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("a barra visual é decorativa e escondida de leitores de tela, para não anunciar segmentos vazios (WCAG 1.3.1)", () => {
    render(<UsedRangesTrack usedRanges={[{ start: 10, end: 20 }]} max={120} />);

    const bar = screen.getByTestId("used-ranges-track");
    expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("sem trechos usados, não renderiza texto enganoso nem a lista", () => {
    render(<UsedRangesTrack usedRanges={[]} max={120} />);
    expect(screen.queryByText(/Já usado por cortes existentes/i)).toBeNull();
  });
});
