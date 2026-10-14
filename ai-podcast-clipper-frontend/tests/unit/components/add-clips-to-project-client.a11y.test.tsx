import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddClipsToProjectClient } from "~/components/dashboard/add-clips-to-project-client";
import { addClipsToProjectAction } from "~/actions/projects-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/actions/projects-actions", () => ({
  addClipsToProjectAction: vi.fn(),
}));

// Diferente de `add-clips-to-project-client.test.tsx`, aqui o Slider do Radix
// é o REAL (sem mock), para verificar a navegação por teclado de verdade.

const baseProps = {
  projectId: "project-1",
  projectName: "Meu Podcast",
  youtubeUrl: "https://www.youtube.com/watch?v=abc123",
  videoDurationSeconds: 3600,
  usedRanges: [{ start: 0, end: 30 }],
  userCredits: 50,
};

describe("AddClipsToProjectClient - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // O Slider do Radix usa ResizeObserver, que o jsdom não implementa.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("slider do novo trecho (IA) responde a setas e Home/End pelo teclado (WCAG 2.1.1 Teclado)", () => {
    render(<AddClipsToProjectClient {...baseProps} />);

    const startThumb = screen.getByRole("slider", { name: "Início do novo trecho" });
    const endThumb = screen.getByRole("slider", { name: "Fim do novo trecho" });

    const before = Number(startThumb.getAttribute("aria-valuenow"));
    fireEvent.keyDown(startThumb, { key: "ArrowRight" });
    expect(Number(startThumb.getAttribute("aria-valuenow"))).toBe(before + 1);

    fireEvent.keyDown(startThumb, { key: "Home" });
    expect(Number(startThumb.getAttribute("aria-valuenow"))).toBe(0);

    fireEvent.keyDown(endThumb, { key: "End" });
    expect(Number(endThumb.getAttribute("aria-valuenow"))).toBe(3600);
  });

  it("sliders de corte manual respondem a setas e Home/End pelo teclado (WCAG 2.1.1 Teclado)", () => {
    render(<AddClipsToProjectClient {...baseProps} />);
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));

    const startThumb = screen.getByRole("slider", { name: "Início do corte novo 1 (deslizante)" });
    const endThumb = screen.getByRole("slider", { name: "Fim do corte novo 1 (deslizante)" });

    fireEvent.keyDown(endThumb, { key: "ArrowLeft" });
    const endAfterArrow = Number(endThumb.getAttribute("aria-valuenow"));
    expect(endAfterArrow).toBeLessThan(Number(endThumb.getAttribute("aria-valuemax")));

    fireEvent.keyDown(startThumb, { key: "Home" });
    expect(Number(startThumb.getAttribute("aria-valuenow"))).toBe(0);
  });

  it("os sliders expõem valor legível (aria-valuetext) em mm:ss (WCAG 4.1.2 Nome, Função, Valor)", () => {
    render(<AddClipsToProjectClient {...baseProps} />);
    const startThumb = screen.getByRole("slider", { name: "Início do novo trecho" });
    expect(startThumb.getAttribute("aria-valuetext")).toMatch(/^\d{2}:\d{2}/);
  });

  it("o bloqueio de sobreposição com clipe existente é um role=alert ligado ao campo (WCAG 4.1.3 / 3.3.1)", () => {
    render(<AddClipsToProjectClient {...baseProps} usedRanges={[{ start: 100, end: 130 }]} />);
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));

    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), { target: { value: "01:50" } });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), { target: { value: "02:20" } });

    const alert = screen
      .getAllByRole("alert")
      .find((el) => /se sobrepõe a um clipe já existente/i.test(el.textContent ?? ""));
    expect(alert).toBeDefined();
    expect(alert!.id).not.toBe("");

    const endInput = screen.getByLabelText("Fim do corte novo 1");
    expect(endInput).toHaveAttribute("aria-invalid", "true");
    const describedBy = endInput.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toContain(alert!.id);
  });

  it("o aviso de créditos insuficientes é role=alert (WCAG 4.1.3)", () => {
    // Com 0 créditos, o trecho padrão (5 min, cobrado) já excede o saldo.
    render(<AddClipsToProjectClient {...baseProps} userCredits={0} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/créditos insuficientes/i);
  });

  it("enquanto os cortes são enviados, o estado de processamento é anunciado a leitores de tela (WCAG 4.1.3 Mensagens de status)", async () => {
    // Promise que nunca resolve: mantém o estado de envio ativo.
    vi.mocked(addClipsToProjectAction).mockReturnValueOnce(new Promise(() => undefined) as any);
    render(<AddClipsToProjectClient {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Adicionar cortes/i }));

    await waitFor(() => {
      const statuses = screen.getAllByRole("status");
      const sending = statuses.find((el) => /enviando/i.test(el.textContent ?? ""));
      expect(sending).toBeDefined();
    });
  });
});
