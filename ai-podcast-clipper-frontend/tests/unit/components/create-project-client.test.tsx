import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { importYouTubeVideo } from "~/actions/youtube";
import { retryProjectAction } from "~/actions/projects-actions";
import { toast } from "sonner";
import type { ProcessingOption } from "~/application/services/processing-options.service";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/actions/youtube", () => ({
  importYouTubeVideo: vi.fn(),
}));

// Guarda o onValueChange de cada Slider (por data-testid) para os testes
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

vi.mock("~/actions/projects-actions", () => ({
  retryProjectAction: vi.fn(),
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

const mockOptions: Record<string, ProcessingOption[]> = {
  GENRE: [
    {
      id: "1",
      type: "GENRE",
      value: "humor",
      label: "Humor",
      order: 1,
      isActive: true,
      isDefault: false,
    },
    {
      id: "2",
      type: "GENRE",
      value: "podcast",
      label: "Podcast",
      order: 2,
      isActive: true,
      isDefault: true,
    },
  ],
  ASPECT_RATIO: [
    {
      id: "5",
      type: "ASPECT_RATIO",
      value: "9:16",
      label: "Vertical (9:16)",
      order: 1,
      isActive: true,
      isDefault: true,
    },
    {
      id: "6",
      type: "ASPECT_RATIO",
      value: "16:9",
      label: "Horizontal (16:9)",
      order: 2,
      isActive: true,
      isDefault: false,
    },
  ],
  CLIP_MODEL: [
    {
      id: "7",
      type: "CLIP_MODEL",
      value: "auto",
      label: "Padrão",
      order: 1,
      isActive: true,
      isDefault: true,
    },
    {
      id: "8",
      type: "CLIP_MODEL",
      value: "face_focus",
      label: "Foco no Rosto",
      order: 2,
      isActive: true,
      isDefault: false,
    },
  ],
};

describe("CreateProjectClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders the initial URL import input", () => {
    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    expect(screen.getByText(/Transforme vídeos longos em/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
    ).toBeInTheDocument();
  });

  it("does not expose the direct file upload option (go-live: YouTube import only)", () => {
    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    // A opção de upload direto de arquivo foi escondida: o stub não faz upload
    // real para o S3 nem cria o projeto, e enganava o usuário com um toast de
    // sucesso falso. Ver AGENTS.md / checklist-go-live.md.
    expect(screen.queryByText("Enviar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/enviar arquivo de vídeo/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();

    // A importação via YouTube continua funcionando normalmente.
    expect(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
    ).toBeInTheDocument();
  });

  it("fetches video metadata and displays dynamic options", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    const input = screen.getByPlaceholderText(
      "Cole o link do YouTube (ex: https://youtube.com/watch?v=...)",
    );
    fireEvent.change(input, {
      target: { value: "https://youtube.com/watch?v=12345" },
    });

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    // Verify dynamic options rendered
    expect(screen.getByText("Configurações do Corte")).toBeInTheDocument();
    expect(screen.getByText("Gênero do Conteúdo")).toBeInTheDocument();
    expect(screen.getByText("Auto Zoom")).toBeInTheDocument();

    // "Modelo do Clipe" e "Proporção" foram removidos da UI: não têm efeito
    // real no backend (ver AGENTS.md / checklist-go-live.md), então deixaram
    // de ser escolhíveis pelo usuário (decisão de produto, 2026-10-13).
    expect(screen.queryByText("Modelo do Clipe (Modo de IA)")).not.toBeInTheDocument();
    expect(screen.queryByText("Proporção (Aspect Ratio)")).not.toBeInTheDocument();

    // Verify Sem Legenda card is present
    expect(screen.getByText("Sem Legenda")).toBeInTheDocument();
  });

  it("selects default options based on isDefault", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    const genreSelect = screen.getByLabelText(
      "Gênero do Conteúdo",
    ) as HTMLSelectElement;
    expect(genreSelect.value).toBe("podcast"); // id: 2 isDefault

    // "Modelo do Clipe" e "Proporção" não têm mais seletor (ver teste
    // acima); o default de cada um ainda é enviado como constante fixa no
    // submit, coberto no teste "submits video with dynamic options...".
    expect(screen.queryByLabelText("Modelo do Clipe (Modo de IA)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Proporção")).not.toBeInTheDocument();

    const autoZoomSwitch = screen.getByLabelText(
      "Auto Zoom",
    ) as HTMLButtonElement;
    expect(autoZoomSwitch.getAttribute("aria-checked")).toBe("true");
  });

  it("submits video with dynamic options and 'Sem Legenda' preset NONE", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({
      success: true,
      uploadedFileId: "file-xyz",
    });

    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    // Change genre to humor
    fireEvent.change(screen.getByLabelText("Gênero do Conteúdo"), {
      target: { value: "humor" },
    });

    // Click "Sem Legenda" card
    fireEvent.click(screen.getByText("Sem Legenda"));

    // Toggle auto zoom
    fireEvent.click(screen.getByLabelText("Auto Zoom"));

    // Submit
    fireEvent.click(screen.getByText("Confirmar e Processar"));

    await waitFor(() => {
      expect(importYouTubeVideo).toHaveBeenCalledWith({
        url: "https://youtube.com/watch?v=12345",
        preset: "NONE",
        sliceStartTime: 0,
        sliceEndTime: 300,
        mode: "auto",
        genre: "humor",
        clipModel: "auto",
        aspectRatio: "9:16",
        autoZoom: false,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      });
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Vídeo enviado para processamento!",
    );
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("blocks submission if user credits are insufficient", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    // user has only 2 credits, default slice 0..5 costs 5 credits
    render(<CreateProjectClient isConfigRoute={true} userCredits={2} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    const submitBtn = screen.getByText("Confirmar e Processar");
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);
    expect(importYouTubeVideo).not.toHaveBeenCalled();
  });
});


describe("CreateProjectClient - modo manual de cortes", () => {
  const URL_YT = "https://youtube.com/watch?v=12345";
  const metaResponse = (durationSeconds = 600) => ({
    ok: true,
    json: async () => ({
      title: "Podcast Incrível",
      durationSeconds,
      thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
    }),
  });

  async function openConfig({
    credits = 10,
    duration = 600,
  }: { credits?: number; duration?: number } = {}) {
    (global.fetch as any).mockResolvedValueOnce(metaResponse(duration));
    render(
      <CreateProjectClient isConfigRoute={true} userCredits={credits} options={mockOptions} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      { target: { value: URL_YT } },
    );
    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });
  }

  const manualRadio = () => screen.getByRole("radio", { name: /Manual: eu defino os cortes/i });
  const autoRadio = () => screen.getByRole("radio", { name: /Automático: a IA escolhe/i });
  const setTime = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("mostra o seletor de modo com Automático como padrão e sem editor", async () => {
    await openConfig();

    expect(screen.getByRole("radiogroup", { name: /Como os cortes serão definidos/i })).toBeInTheDocument();
    expect(autoRadio()).toBeChecked();
    expect(manualRadio()).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Adicionar corte/i })).not.toBeInTheDocument();
    expect(screen.getByText("Fatiador Inteligente")).toBeInTheDocument();
  });

  it("alternar para Manual mostra o editor com uma linha vazia e esconde o Fatiador", async () => {
    await openConfig();
    fireEvent.click(manualRadio());

    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Adicionar corte/i })).toBeEnabled();
    expect(screen.queryByText("Fatiador Inteligente")).not.toBeInTheDocument();
    expect(screen.queryByTestId("range-slider")).not.toBeInTheDocument();
    // a descrição do card não afirma mais que os cortes são gerados por IA
    expect(screen.queryByText(/gerados por IA/i)).not.toBeInTheDocument();

    fireEvent.click(autoRadio());
    expect(screen.queryByLabelText("Início do corte 1")).not.toBeInTheDocument();
    expect(screen.getByText("Fatiador Inteligente")).toBeInTheDocument();
  });

  it("adiciona e remove linhas de corte", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    expect(screen.getByLabelText("Início do corte 2")).toBeInTheDocument();

    setTime("Início do corte 2", "00:10");
    fireEvent.click(screen.getByRole("button", { name: "Remover corte 1" }));
    expect(screen.queryByLabelText("Início do corte 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("00:10");
  });

  it("não deixa remover a última linha: ela é apenas limpa", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    setTime("Início do corte 1", "00:10");
    fireEvent.click(screen.getByRole("button", { name: "Remover corte 1" }));
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("");
  });

  it("valida formato de tempo com mensagem associada ao campo (aria-invalid + aria-describedby)", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    setTime("Início do corte 1", "abc");

    const input = screen.getByLabelText("Início do corte 1");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(describedBy).toBeTruthy();
    const msg = document.getElementById(describedBy.split(" ")[0]!)!;
    expect(msg).toHaveTextContent(/formato inválido/i);
    expect(msg).toHaveAttribute("role", "alert");
  });

  it("valida fim <= início, duração > 60s e fim além da duração do vídeo", async () => {
    await openConfig({ duration: 600 });
    fireEvent.click(manualRadio());

    setTime("Início do corte 1", "01:00");
    setTime("Fim do corte 1", "00:30");
    expect(screen.getByText(/O fim deve ser depois do início/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Fim do corte 1")).toHaveAttribute("aria-invalid", "true");

    setTime("Fim do corte 1", "02:30");
    expect(screen.getByText(/O corte pode ter no máximo 60s/i)).toBeInTheDocument();

    setTime("Início do corte 1", "09:50");
    setTime("Fim do corte 1", "10:10");
    expect(screen.getByText(/passa da duração do vídeo/i)).toBeInTheDocument();

    setTime("Fim do corte 1", "10:00");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveAttribute("aria-invalid", "false");
  });

  it("aceita h:mm:ss para podcasts longos", async () => {
    await openConfig({ duration: 7200, credits: 10 });
    fireEvent.click(manualRadio());
    setTime("Início do corte 1", "1:30:00");
    setTime("Fim do corte 1", "1:30:45");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeEnabled();
  });

  it("avisa sobreposição sem bloquear o envio", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    setTime("Início do corte 1", "00:00");
    setTime("Fim do corte 1", "00:30");
    setTime("Início do corte 2", "00:20");
    setTime("Fim do corte 2", "00:50");

    expect(screen.getAllByText(/Sobrepõe o corte/i).length).toBe(2);
    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeEnabled();
  });

  it("limita a 50 cortes e explica o motivo ao desabilitar Adicionar", { timeout: 60000 }, async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    for (let i = 1; i < 50; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    }
    expect(screen.getByLabelText("Início do corte 50")).toBeInTheDocument();
    const add = screen.getByRole("button", { name: /Adicionar corte/i });
    expect(add).toBeDisabled();
    expect(screen.getByText(/limite de 50 cortes/i)).toBeInTheDocument();
  });

  it("mostra o custo calculado sobre os cortes válidos (1 crédito por corte de até 60s)", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    expect(screen.getByTestId("processing-cost")).toHaveTextContent(/^0\s*Créditos/);

    setTime("Início do corte 1", "00:00");
    setTime("Fim do corte 1", "00:45");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    setTime("Início do corte 2", "01:00");
    setTime("Fim do corte 2", "02:00");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    setTime("Início do corte 3", "x"); // inválido: não entra no custo

    expect(screen.getByTestId("processing-cost")).toHaveTextContent(/^2\s*Créditos/);
  });

  it("desabilita o envio sem cortes completos ou com corte inválido", async () => {
    await openConfig();
    fireEvent.click(manualRadio());
    const submit = screen.getByRole("button", { name: /Confirmar e Processar/i });
    expect(submit).toBeDisabled(); // linha vazia
    expect(screen.getByText(/Preencha início e fim/i)).toBeInTheDocument();

    setTime("Início do corte 1", "00:10");
    setTime("Fim do corte 1", "00:05");
    expect(submit).toBeDisabled();

    setTime("Fim do corte 1", "00:40");
    expect(submit).toBeEnabled();
  });

  it("bloqueia o envio quando o custo manual excede os créditos do usuário", async () => {
    await openConfig({ credits: 1 });
    fireEvent.click(manualRadio());
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    setTime("Início do corte 1", "00:00");
    setTime("Fim do corte 1", "00:30");
    setTime("Início do corte 2", "01:00");
    setTime("Fim do corte 2", "01:30");

    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeDisabled();
    expect(screen.getByText(/créditos insuficientes/i)).toBeInTheDocument();
  });

  it("envia mode manual com cortes em segundos e sem sliceStartTime/sliceEndTime", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: true, uploadedFileId: "f1" });
    await openConfig();
    fireEvent.click(manualRadio());
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    setTime("Início do corte 1", "01:00");
    setTime("Fim do corte 1", "01:30");
    fireEvent.change(screen.getByLabelText("Título do corte 1 (opcional)"), {
      target: { value: "Abertura" },
    });
    setTime("Início do corte 2", "5:00");
    setTime("Fim do corte 2", "5:20");

    fireEvent.click(screen.getByRole("button", { name: /Confirmar e Processar/i }));

    await waitFor(() => expect(importYouTubeVideo).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(importYouTubeVideo).mock.calls[0]![0];
    expect(arg).toMatchObject({
      url: URL_YT,
      mode: "manual",
      preset: "HORMOZI",
      genre: "podcast",
      clipModel: "auto",
      aspectRatio: "9:16",
      autoZoom: true,
    });
    expect(arg).not.toHaveProperty("sliceStartTime");
    expect(arg).not.toHaveProperty("sliceEndTime");
    expect(arg.manualCuts).toEqual([
      { id: expect.any(String), title: "Abertura", startTime: 60, endTime: 90 },
      { id: expect.any(String), startTime: 300, endTime: 320 },
    ]);
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("voltar para Automático envia como hoje (slice, mode auto, sem manualCuts)", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: true, uploadedFileId: "f1" });
    await openConfig();
    fireEvent.click(manualRadio());
    setTime("Início do corte 1", "00:00");
    setTime("Fim do corte 1", "00:30");
    fireEvent.click(autoRadio());
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e Processar/i }));

    await waitFor(() => expect(importYouTubeVideo).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(importYouTubeVideo).mock.calls[0]![0];
    expect(arg.mode).toBe("auto");
    expect(arg.sliceStartTime).toBe(0);
    expect(arg.sliceEndTime).toBe(300);
    expect(arg).not.toHaveProperty("manualCuts");
  });

  it("no modo manual exibe o erro da action e permite tentar de novo", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: false, error: "Falhou" });
    await openConfig();
    fireEvent.click(manualRadio());
    setTime("Início do corte 1", "00:00");
    setTime("Fim do corte 1", "00:30");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e Processar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falhou"));
    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeEnabled();
  });

  it("acessibilidade: controles têm label e o editor é navegável por teclado", async () => {
    await openConfig();
    fireEvent.click(manualRadio());

    const group = screen.getByRole("group", { name: "Corte 1" });
    expect(within(group).getByLabelText("Início do corte 1")).toBeInTheDocument();
    expect(within(group).getByLabelText("Fim do corte 1")).toBeInTheDocument();
    expect(within(group).getByLabelText("Título do corte 1 (opcional)")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Remover corte 1" })).toBeInTheDocument();

    // Sem user-event no projeto: garantimos que todos os controles são nativos,
    // focáveis (sem tabindex negativo) e estão na ordem lógica do DOM, que é a
    // ordem de Tab (início -> fim -> título -> remover -> adicionar).
    const ordered = [
      screen.getByLabelText("Início do corte 1"),
      screen.getByLabelText("Fim do corte 1"),
      screen.getByLabelText("Título do corte 1 (opcional)"),
      screen.getByRole("button", { name: "Remover corte 1" }),
      screen.getByRole("button", { name: /Adicionar corte/i }),
    ];
    ordered.forEach((el) => {
      expect(el.getAttribute("tabindex")).not.toBe("-1");
      el.focus();
      expect(el).toHaveFocus();
    });
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(
        ordered[i]!.compareDocumentPosition(ordered[i + 1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(ordered[3]!.tagName).toBe("BUTTON");
    expect(ordered[4]!.tagName).toBe("BUTTON");
  });

  it("em editMode o seletor de modo não aparece (fora de escopo)", () => {
    render(
      <CreateProjectClient
        isConfigRoute={true}
        userCredits={10}
        options={mockOptions}
        editMode={true}
        editProjectId="p1"
        initialUrl={URL_YT}
        initialMetadata={{ title: "Podcast Incrível", durationSeconds: 600 }}
      />,
    );
    expect(screen.getByText("Configurações do Corte")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Fatiador Inteligente")).toBeInTheDocument();
  });
});


describe("CreateProjectClient - Fatiador com precisão de segundos", () => {
  const URL_YT = "https://youtube.com/watch?v=12345";
  async function openConfig(duration: number, credits = 50) {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: duration,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });
    render(
      <CreateProjectClient isConfigRoute={true} userCredits={credits} options={mockOptions} />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      { target: { value: URL_YT } },
    );
    await waitFor(() => expect(screen.getByText("Podcast Incrível")).toBeInTheDocument());
  }

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("vídeo de 10:50: o slider vai até o fim real (650s) com passo de 1s e mostra a duração formatada", async () => {
    await openConfig(650);
    const slider = screen.getByTestId("range-slider");
    expect(slider).toHaveAttribute("data-min", "0");
    expect(slider).toHaveAttribute("data-max", "650");
    expect(slider).toHaveAttribute("data-step", "1");
    expect(screen.getByText(/Duração total: 10:50/)).toBeInTheDocument();
    expect(screen.queryByText(/10 minutos/)).not.toBeInTheDocument();
    // padrão inalterado: 0..5min
    expect(sliderValues("range-slider")).toEqual([0, 300]);
  });

  it("selecionar até 650s envia sliceEndTime=650 exato e cobra 11 créditos", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: true, uploadedFileId: "f" });
    await openConfig(650);
    dragSlider("range-slider", [0, 650]);

    expect(screen.getByTestId("processing-cost")).toHaveTextContent("11");
    const labels = screen.getByTestId("range-labels");
    expect(labels).toHaveTextContent("00:00");
    expect(labels).toHaveTextContent("10:50");

    fireEvent.click(screen.getByText("Confirmar e Processar"));
    await waitFor(() => expect(importYouTubeVideo).toHaveBeenCalledTimes(1));
    expect(vi.mocked(importYouTubeVideo).mock.calls[0]![0]).toMatchObject({
      mode: "auto",
      sliceStartTime: 0,
      sliceEndTime: 650,
    });
  });

  it("envia início e fim em segundos não múltiplos de 60 e cobra por minuto ou fração", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: true, uploadedFileId: "f" });
    await openConfig(650);
    dragSlider("range-slider", [45, 150]); // 105s => 2 créditos
    expect(screen.getByTestId("processing-cost")).toHaveTextContent("2");
    fireEvent.click(screen.getByText("Confirmar e Processar"));
    await waitFor(() => expect(importYouTubeVideo).toHaveBeenCalled());
    expect(vi.mocked(importYouTubeVideo).mock.calls[0]![0]).toMatchObject({
      sliceStartTime: 45,
      sliceEndTime: 150,
    });
  });

  it("trecho mínimo de 1s: início e fim iguais são afastados em 1s (cobra 1 crédito)", async () => {
    await openConfig(650);
    dragSlider("range-slider", [100, 100]);
    expect(sliderValues("range-slider")).toEqual([100, 101]);
    expect(screen.getByTestId("processing-cost")).toHaveTextContent("1");
    dragSlider("range-slider", [650, 650]);
    expect(sliderValues("range-slider")).toEqual([649, 650]);
  });

  it("thumbs do Fatiador têm nome acessível e aria-valuetext em formato de tempo", async () => {
    await openConfig(650);
    const [a, b] = within(screen.getByTestId("range-slider")).getAllByRole("slider");
    expect(a).toHaveAttribute("aria-label", "Início do trecho a analisar");
    expect(b).toHaveAttribute("aria-label", "Fim do trecho a analisar");
    expect(a).toHaveAttribute("aria-valuetext", "00:00");
    expect(b).toHaveAttribute("aria-valuetext", "05:00");
  });

  it("modo edição: inicializa o slider em segundos (sem converter) e reenvia em segundos", async () => {
    vi.mocked(retryProjectAction).mockResolvedValueOnce({ success: true } as any);
    render(
      <CreateProjectClient
        isConfigRoute={true}
        userCredits={10}
        options={mockOptions}
        editMode={true}
        editProjectId="p1"
        initialUrl={URL_YT}
        initialMetadata={{ title: "Podcast Incrível", durationSeconds: 650 }}
        initialSettings={{
          preset: "HORMOZI",
          genre: "podcast",
          autoZoom: true,
          sliceStartTime: 95,
          sliceEndTime: 650,
        }}
      />,
    );
    expect(sliderValues("range-slider")).toEqual([95, 650]);
    fireEvent.click(screen.getByText("Confirmar e Processar"));
    await waitFor(() => expect(retryProjectAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(retryProjectAction).mock.calls[0]![1]).toMatchObject({
      sliceStartTime: 95,
      sliceEndTime: 650,
    });
  });

  it("modo edição com trecho salvo vazio (0/0, ex. projeto manual) cai no padrão 0..5min", () => {
    render(
      <CreateProjectClient
        isConfigRoute={true}
        userCredits={10}
        options={mockOptions}
        editMode={true}
        editProjectId="p1"
        initialUrl={URL_YT}
        initialMetadata={{ title: "Podcast Incrível", durationSeconds: 650 }}
        initialSettings={{
          preset: "HORMOZI",
          genre: "podcast",
          autoZoom: true,
          sliceStartTime: 0,
          sliceEndTime: 0,
        }}
      />,
    );
    expect(sliderValues("range-slider")).toEqual([0, 300]);
  });
});

describe("CreateProjectClient - cortes manuais com slider sincronizado", () => {
  const URL_YT = "https://youtube.com/watch?v=12345";
  async function openManual(duration = 600) {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: duration,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });
    render(<CreateProjectClient isConfigRoute={true} userCredits={50} options={mockOptions} />);
    fireEvent.change(
      screen.getByPlaceholderText("Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"),
      { target: { value: URL_YT } },
    );
    await waitFor(() => expect(screen.getByText("Podcast Incrível")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino os cortes/i }));
  }
  const setTime = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("cada corte tem um slider de 0 até a duração real com passo de 1s", async () => {
    await openManual(650);
    const slider = screen.getByTestId("cut-slider-cut-1");
    expect(slider).toHaveAttribute("data-min", "0");
    expect(slider).toHaveAttribute("data-max", "650");
    expect(slider).toHaveAttribute("data-step", "1");
  });

  it("corte novo: o slider sugere 0..30s mas os campos seguem vazios até o usuário interagir", async () => {
    await openManual();
    expect(sliderValues("cut-slider-cut-1")).toEqual([0, 30]);
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeDisabled();
  });

  it("mover o slider preenche os dois campos formatados e valida o corte", async () => {
    await openManual();
    dragSlider("cut-slider-cut-1", [75, 105]);
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("01:15");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveValue("01:45");
    expect(screen.getByTestId("processing-cost")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Confirmar e Processar/i })).toBeEnabled();
  });

  it("digitar tempos válidos move o slider", async () => {
    await openManual();
    setTime("Início do corte 1", "02:00");
    setTime("Fim do corte 1", "02:40");
    expect(sliderValues("cut-slider-cut-1")).toEqual([120, 160]);
  });

  it("texto inválido ou incompleto não move o slider e o erro continua aparecendo", async () => {
    await openManual();
    setTime("Início do corte 1", "02:00");
    setTime("Fim do corte 1", "02:40");
    setTime("Início do corte 1", "02:");
    expect(sliderValues("cut-slider-cut-1")).toEqual([120, 160]);
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("02:");
    expect(screen.getByRole("alert")).toHaveTextContent(/Formato inválido/);
    // válido porém fora do limite de 60s: erro de linha, slider fica onde estava
    setTime("Início do corte 1", "00:00");
    expect(sliderValues("cut-slider-cut-1")).toEqual([120, 160]);
    expect(screen.getByRole("alert")).toHaveTextContent(/no máximo 60s/);
  });

  it("limite de 60s ao arrastar: o outro ponto acompanha", async () => {
    await openManual();
    dragSlider("cut-slider-cut-1", [100, 130]);
    // fim arrastado para longe: o início acompanha
    dragSlider("cut-slider-cut-1", [100, 300]);
    expect(sliderValues("cut-slider-cut-1")).toEqual([240, 300]);
    expect(screen.getByLabelText("Início do corte 1")).toHaveValue("04:00");
    expect(screen.getByLabelText("Fim do corte 1")).toHaveValue("05:00");
    // início arrastado para longe: o fim acompanha
    dragSlider("cut-slider-cut-1", [10, 300]);
    expect(sliderValues("cut-slider-cut-1")).toEqual([10, 70]);
    expect(screen.getByLabelText("Fim do corte 1")).toHaveValue("01:10");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("não deixa os pontos passarem do fim do vídeo nem se cruzarem", async () => {
    await openManual(600);
    dragSlider("cut-slider-cut-1", [590, 600]);
    dragSlider("cut-slider-cut-1", [599, 599]);
    const [s, e] = sliderValues("cut-slider-cut-1");
    expect(e).toBeLessThanOrEqual(600);
    expect(e! - s!).toBeGreaterThanOrEqual(1);
  });

  it("novo corte começa onde o último corte válido terminou, com 30s", async () => {
    await openManual();
    setTime("Início do corte 1", "01:00");
    setTime("Fim do corte 1", "01:30");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    expect(sliderValues("cut-slider-cut-2")).toEqual([90, 120]);
    expect(screen.getByLabelText("Início do corte 2")).toHaveValue("");
  });

  it("novo corte nunca passa do fim do vídeo", async () => {
    await openManual(600);
    setTime("Início do corte 1", "09:30");
    setTime("Fim do corte 1", "10:00");
    fireEvent.click(screen.getByRole("button", { name: /Adicionar corte/i }));
    expect(sliderValues("cut-slider-cut-2")).toEqual([599, 600]);
  });

  it("acessibilidade: pontos nomeados por corte e aria-valuetext em tempo (h:mm:ss em vídeos longos)", async () => {
    await openManual(7200);
    dragSlider("cut-slider-cut-1", [3661, 3700]);
    const [a, b] = within(screen.getByTestId("cut-slider-cut-1")).getAllByRole("slider");
    expect(a).toHaveAttribute("aria-label", "Início do corte 1 (deslizante)");
    expect(b).toHaveAttribute("aria-label", "Fim do corte 1 (deslizante)");
    expect(a).toHaveAttribute("aria-valuetext", "1:01:01");
    expect(b).toHaveAttribute("aria-valuetext", "1:01:40");
  });

  it("remover a última linha restaura o slider ao padrão", async () => {
    await openManual();
    dragSlider("cut-slider-cut-1", [200, 230]);
    fireEvent.click(screen.getByRole("button", { name: "Remover corte 1" }));
    expect(sliderValues("cut-slider-cut-1")).toEqual([0, 30]);
  });

  it("envia o corte escolhido pelo slider em segundos", async () => {
    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({ success: true, uploadedFileId: "f" });
    await openManual();
    dragSlider("cut-slider-cut-1", [75, 105]);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e Processar/i }));
    await waitFor(() => expect(importYouTubeVideo).toHaveBeenCalled());
    expect(vi.mocked(importYouTubeVideo).mock.calls[0]![0].manualCuts).toEqual([
      { id: expect.any(String), startTime: 75, endTime: 105 },
    ]);
  });
});
