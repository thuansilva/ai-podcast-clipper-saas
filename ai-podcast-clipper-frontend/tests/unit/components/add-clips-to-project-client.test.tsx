import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { AddClipsToProjectClient } from "~/components/dashboard/add-clips-to-project-client";
import { addClipsToProjectAction } from "~/actions/projects-actions";
import { toast } from "sonner";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/actions/projects-actions", () => ({
  addClipsToProjectAction: vi.fn(),
}));

// Mesma técnica de `create-project-client.test.tsx`: guarda o
// `onValueChange` de cada Slider (por `data-testid`) para os testes
// dirigirem o arraste sem depender de geometria/pointer events do jsdom.
const sliderHandlers = vi.hoisted(
  () => new Map<string, (values: number[]) => void>(),
);

vi.mock("~/components/ui/slider", () => ({
  Slider: ({
    value,
    min,
    max,
    step,
    onValueChange,
    thumbLabels,
    thumbValueText,
    "data-testid": testId,
  }: any) => {
    sliderHandlers.set(testId, onValueChange);
    return (
      <div data-testid={testId} data-min={min} data-max={max} data-step={step}>
        {(value as number[]).map((v, i) => (
          <span
            key={i}
            role="slider"
            tabIndex={0}
            aria-label={thumbLabels?.[i]}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={v}
            aria-valuetext={thumbValueText?.(v, i)}
          />
        ))}
      </div>
    );
  },
}));

function dragSlider(testId: string, values: number[]) {
  const handler = sliderHandlers.get(testId);
  if (!handler) throw new Error(`slider ${testId} não renderizado`);
  act(() => handler(values));
}

const sliderValues = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole("slider")
    .map((el) => Number(el.getAttribute("aria-valuenow")));

const baseProps = {
  projectId: "project-1",
  projectName: "Meu Podcast",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
  thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  videoDurationSeconds: 3600,
  usedRanges: [{ start: 0, end: 30 }],
  userCredits: 50,
};

describe("AddClipsToProjectClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sliderHandlers.clear();
  });

  it("renderiza com o modo IA como padrão e mostra a URL fixa (não editável)", () => {
    render(<AddClipsToProjectClient {...baseProps} />);

    expect(screen.getByRole("radio", { name: /IA gera mais/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Manual: eu defino/i })).not.toBeChecked();
    // Não há input de URL editável neste fluxo.
    expect(screen.queryByPlaceholderText(/youtube\.com\/watch/i)).not.toBeInTheDocument();
  });

  describe("cabeçalho do vídeo original", () => {
    it("mostra o link em texto 'Assistir no YouTube' com href canônico, sem a URL crua", () => {
      render(<AddClipsToProjectClient {...baseProps} />);

      const link = screen.getByTestId("append-youtube-url");
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveTextContent(/Assistir no YouTube/);
      expect(screen.queryByText(/youtube\.com\/watch/)).not.toBeInTheDocument();
    });

    it("mostra a thumbnail do vídeo original quando existe", () => {
      render(<AddClipsToProjectClient {...baseProps} />);

      const img = screen.getByTestId("append-video-thumbnail");
      expect(img).toHaveAttribute("src", baseProps.thumbnailUrl);
      expect(img).toHaveAttribute("alt", expect.stringMatching(/Meu Podcast/));
    });

    it("usa um placeholder quando não há thumbnail", () => {
      render(<AddClipsToProjectClient {...baseProps} thumbnailUrl={null} />);

      expect(screen.queryByTestId("append-video-thumbnail")).not.toBeInTheDocument();
      expect(screen.getByTestId("append-video-thumbnail-placeholder")).toBeInTheDocument();
    });

    it("não renderiza link quando a URL não é do YouTube", () => {
      render(<AddClipsToProjectClient {...baseProps} youtubeUrl="javascript:alert(1)//youtube.com" />);

      expect(screen.queryByTestId("append-youtube-url")).not.toBeInTheDocument();
    });

    it("mostra a duração do vídeo original", () => {
      render(<AddClipsToProjectClient {...baseProps} />);

      expect(screen.getByTestId("append-video-meta")).toHaveTextContent("60 min");
    });
  });

  it("mostra a trilha de trechos já usados em ambos os modos", () => {
    render(<AddClipsToProjectClient {...baseProps} />);
    expect(screen.getAllByTestId("used-ranges-track").length).toBeGreaterThan(0);
    expect(screen.getByText(/Já usado por cortes existentes/i)).toBeInTheDocument();
    expect(screen.getByText(/00:00–00:30/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));
    expect(screen.getByText(/Já usado por cortes existentes/i)).toBeInTheDocument();
  });

  it("modo IA: custo reflete só o slice escolhido (incremento), nunca o vídeo inteiro", async () => {
    render(<AddClipsToProjectClient {...baseProps} />);
    dragSlider("append-ai-slice-slider", [100, 160]); // 60s => 1 crédito
    expect(screen.getByTestId("append-processing-cost")).toHaveTextContent(/^1\s*Créditos/);
  });

  it("modo IA: avisa (sem bloquear) quando o slice escolhido cobre um trecho já usado", async () => {
    render(<AddClipsToProjectClient {...baseProps} usedRanges={[{ start: 10, end: 20 }]} />);
    dragSlider("append-ai-slice-slider", [0, 60]);

    expect(screen.getByText(/1 trecho já usado dentro deste período será pulado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar cortes/i })).toBeEnabled();
  });

  it("modo IA: envia aiSlice com os tempos escolhidos", async () => {
    vi.mocked(addClipsToProjectAction).mockResolvedValueOnce({ success: true, batchId: "b1" });
    render(<AddClipsToProjectClient {...baseProps} />);
    dragSlider("append-ai-slice-slider", [100, 160]);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar cortes/i }));

    await waitFor(() =>
      expect(addClipsToProjectAction).toHaveBeenCalledWith("project-1", {
        mode: "auto",
        aiSlice: { startTime: 100, endTime: 160 },
      }),
    );
    expect(toast.success).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/dashboard/projects/project-1");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("modo manual: bloqueia (não só avisa) um corte novo que se sobrepõe a um clipe existente", async () => {
    render(<AddClipsToProjectClient {...baseProps} usedRanges={[{ start: 100, end: 130 }]} />);
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));

    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), { target: { value: "01:50" } });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), { target: { value: "02:20" } });

    expect(screen.getByText(/se sobrepõe a um clipe já existente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar cortes/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Adicionar cortes/i }));
    expect(addClipsToProjectAction).not.toHaveBeenCalled();
  });

  it("modo manual: corte sem sobreposição habilita o envio e manda manualCuts", async () => {
    vi.mocked(addClipsToProjectAction).mockResolvedValueOnce({ success: true, batchId: "b2" });
    render(<AddClipsToProjectClient {...baseProps} usedRanges={[{ start: 100, end: 130 }]} />);
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));

    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), { target: { value: "05:00" } });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), { target: { value: "05:30" } });

    const submit = screen.getByRole("button", { name: /Adicionar cortes/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(addClipsToProjectAction).toHaveBeenCalledWith("project-1", {
        mode: "manual",
        manualCuts: [{ id: expect.any(String), startTime: 300, endTime: 330 }],
      }),
    );
  });

  it("modo manual: custo reflete só os cortes novos válidos", async () => {
    render(<AddClipsToProjectClient {...baseProps} />);
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));
    expect(screen.getByTestId("append-processing-cost")).toHaveTextContent(/^0\s*Créditos/);

    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), { target: { value: "05:00" } });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), { target: { value: "05:30" } });
    expect(screen.getByTestId("append-processing-cost")).toHaveTextContent(/^1\s*Créditos/);
  });

  it("bloqueia o envio quando os créditos do usuário são insuficientes", async () => {
    render(<AddClipsToProjectClient {...baseProps} userCredits={0} />);
    dragSlider("append-ai-slice-slider", [0, 60]);

    expect(screen.getByText(/créditos insuficientes/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /Adicionar cortes/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(addClipsToProjectAction).not.toHaveBeenCalled();
  });

  it.each([
    "O corte de 110s a 140s se sobrepõe a um clipe já existente deste projeto (100s–130s). Ajuste os tempos e tente novamente.",
    "Este projeto já tem um processamento em andamento. Aguarde terminar antes de adicionar mais cortes.",
    "Só é possível adicionar mais cortes a projetos importados do YouTube.",
    "Este projeto tem clipes antigos sem o tempo original registrado e não suporta adicionar mais cortes ainda. Reprocesse o projeto do zero para habilitar esta função.",
  ])("exibe a mensagem de erro de domínio devolvida pela action: %s", async (errorMessage) => {
    vi.mocked(addClipsToProjectAction).mockResolvedValueOnce({
      success: false,
      error: errorMessage,
    });
    render(<AddClipsToProjectClient {...baseProps} />);
    dragSlider("append-ai-slice-slider", [200, 260]);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar cortes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(errorMessage));
    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText(errorMessage).closest('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: /Adicionar cortes/i })).toBeEnabled();
  });

  it("mostra mensagem genérica quando a action falha sem mensagem", async () => {
    vi.mocked(addClipsToProjectAction).mockResolvedValueOnce({ success: false, error: undefined });
    render(<AddClipsToProjectClient {...baseProps} />);
    dragSlider("append-ai-slice-slider", [200, 260]);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar cortes/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Ocorreu um erro inesperado ao adicionar cortes. Tente novamente.",
      ),
    );
  });
});
