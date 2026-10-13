import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ShowcaseCarousel } from "~/components/landing/showcase-carousel";

describe("ShowcaseCarousel - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("avança sozinho a cada 5s quando não pausado (estado de referência)", () => {
    render(<ShowcaseCarousel />);
    expect(screen.getByRole("img", { name: "Artificial Intelligence in Action" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("img", { name: "Perfect Vertical Cuts" })).toBeInTheDocument();
  });

  it("oferece um controle para pausar a rotação automática (WCAG 2.2.2 Pause, Stop, Hide)", () => {
    render(<ShowcaseCarousel />);
    expect(screen.getByRole("button", { name: "Pause showcase rotation" })).toBeInTheDocument();
  });

  it("ao pausar, a rotação automática para e o controle passa a oferecer retomar", () => {
    render(<ShowcaseCarousel />);
    fireEvent.click(screen.getByRole("button", { name: "Pause showcase rotation" }));

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByRole("img", { name: "Artificial Intelligence in Action" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume showcase rotation" })).toBeInTheDocument();
  });

  it("slides inativos ficam ocultos da árvore de acessibilidade (WCAG 1.3.1)", () => {
    render(<ShowcaseCarousel />);

    // Os 3 slides estão no DOM, mas só o ativo deve ser exposto a leitores de tela.
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
