import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportVideoTabs } from "~/components/import-video-tabs";
import { importYouTubeVideo } from "~/actions/youtube";
import { generateUploadUrl } from "~/actions/s3";
import { processVideo } from "~/actions/generation";
import { toast } from "sonner";

vi.mock("~/actions/youtube", () => ({
  importYouTubeVideo: vi.fn(),
}));

vi.mock("~/actions/s3", () => ({
  generateUploadUrl: vi.fn(),
}));

vi.mock("~/actions/generation", () => ({
  processVideo: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function switchToTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0 });
}

describe("ImportVideoTabs (Task 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  describe("1. Renderização das abas e presets", () => {
    it("deve renderizar as duas abas e os campos principais", () => {
      render(<ImportVideoTabs userCredits={15} />);

      // Verifica título do card
      expect(screen.getByText(/importar vídeo para cortes/i)).toBeInTheDocument();

      // Verifica triggers das abas
      expect(screen.getByRole("tab", { name: /upload de arquivo/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /link do youtube/i })).toBeInTheDocument();

      // Inicialmente na aba de Upload
      expect(screen.getByRole("button", { name: /enviar e gerar cortes/i })).toBeInTheDocument();
      expect(
        screen.getByText(/arraste e solte seu arquivo de vídeo/i),
      ).toBeInTheDocument();
    });

    it("deve exibir os 3 presets de legendas (HORMOZI, MINIMAL, NEON) com HORMOZI padrão", () => {
      render(<ImportVideoTabs userCredits={10} />);

      expect(screen.getByTestId("preset-button-hormozi")).toBeInTheDocument();
      expect(screen.getByTestId("preset-button-minimal")).toBeInTheDocument();
      expect(screen.getByTestId("preset-button-neon")).toBeInTheDocument();

      expect(screen.getByText(/HORMOZI selecionado/i)).toBeInTheDocument();
    });

    it("deve alternar entre as abas ao clicar no trigger", () => {
      render(<ImportVideoTabs userCredits={10} />);

      switchToTab(/link do youtube/i);

      expect(screen.getByPlaceholderText(/youtube\.com/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /importar do youtube/i })).toBeInTheDocument();
    });

    it("deve exibir o badge do plano com limite correto (Starter = 2h, Studio = 3h)", () => {
      const { rerender } = render(<ImportVideoTabs userCredits={10} userPlan="STARTER" />);
      expect(screen.getByTestId("plan-limit-badge")).toHaveTextContent("Plano Starter: Máx. 2h por vídeo");

      rerender(<ImportVideoTabs userCredits={10} userPlan="STUDIO" />);
      expect(screen.getByTestId("plan-limit-badge")).toHaveTextContent("Plano Studio: Máx. 3h por vídeo");
    });
  });

  describe("2. Validação de URL do YouTube e submissão", () => {
    it("deve mostrar erro visual e desabilitar botão quando URL for inválida", () => {
      render(<ImportVideoTabs userCredits={10} />);

      switchToTab(/link do youtube/i);

      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, { target: { value: "https://vimeo.com/123456" } });

      expect(
        screen.getByText(/insira uma url válida do youtube/i),
      ).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /importar do youtube/i });
      expect(importBtn).toBeDisabled();
    });

    it("deve validar URL correta do YouTube e habilitar o botão de importação", () => {
      render(<ImportVideoTabs userCredits={10} />);

      switchToTab(/link do youtube/i);

      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, {
        target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      });

      expect(
        screen.getByText(/url válida do youtube \(vídeo id: dqw4w9wgxcq\)/i),
      ).toBeInTheDocument();

      const importBtn = screen.getByRole("button", { name: /importar do youtube/i });
      expect(importBtn).not.toBeDisabled();
    });

    it("deve chamar importYouTubeVideo com URL e preset selecionado, exibir toast e chamar callback", async () => {
      const onUploadSuccess = vi.fn();
      vi.mocked(importYouTubeVideo).mockResolvedValueOnce({
        success: true,
        uploadedFileId: "file-123",
      });

      render(
        <ImportVideoTabs userCredits={10} onUploadSuccess={onUploadSuccess} />,
      );

      switchToTab(/link do youtube/i);

      // Seleciona preset NEON
      fireEvent.click(screen.getByTestId("preset-button-neon"));
      expect(screen.getByText(/NEON selecionado/i)).toBeInTheDocument();

      // Insere URL válida
      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, {
        target: { value: "https://youtu.be/dQw4w9WgXcQ" },
      });

      const importBtn = screen.getByRole("button", { name: /importar do youtube/i });
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(importYouTubeVideo).toHaveBeenCalledWith({
          url: "https://youtu.be/dQw4w9WgXcQ",
          preset: "NEON",
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Vídeo do YouTube importado!",
        expect.any(Object),
      );
      expect(onUploadSuccess).toHaveBeenCalled();
    });

    it("deve exibir toast.error se importYouTubeVideo falhar", async () => {
      vi.mocked(importYouTubeVideo).mockResolvedValueOnce({
        success: false,
        error: "Vídeo indisponível ou privado.",
      });

      render(<ImportVideoTabs userCredits={10} />);

      switchToTab(/link do youtube/i);

      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, {
        target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      });

      fireEvent.click(screen.getByRole("button", { name: /importar do youtube/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Erro ao importar do YouTube",
          expect.objectContaining({
            description: "Vídeo indisponível ou privado.",
          }),
        );
      });
    });
  });

  describe("3. Desabilitação quando saldo é insuficiente", () => {
    it("deve desabilitar botão e exibir alerta na aba YouTube se saldo for 0", () => {
      render(<ImportVideoTabs userCredits={0} />);

      switchToTab(/link do youtube/i);

      expect(
        screen.getByText(/saldo insuficiente: você possui 0 créditos/i),
      ).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, {
        target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      });

      const importBtn = screen.getByRole("button", { name: /importar do youtube/i });
      expect(importBtn).toBeDisabled();
    });

    it("deve desabilitar botão de upload quando não há arquivo selecionado", () => {
      render(<ImportVideoTabs userCredits={5} />);

      const uploadBtn = screen.getByRole("button", {
        name: /enviar e gerar cortes/i,
      });
      expect(uploadBtn).toBeDisabled();
    });

    it("deve desabilitar botão e exibir alerta na aba Upload quando saldo é insuficiente para o vídeo", async () => {
      // Mock createObjectURL e elemento de vídeo com duração de 180s (3 créditos)
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName === "video") {
          const videoElement = originalCreateElement("video");
          Object.defineProperty(videoElement, "duration", {
            value: 180,
            writable: true,
          });
          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event("loadedmetadata"));
            }
          }, 0);
          return videoElement;
        }
        return originalCreateElement(tagName);
      });

      const { container } = render(<ImportVideoTabs userCredits={1} />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      const file = new File(["dummy-content"], "podcast-episode.mp4", {
        type: "video/mp4",
      });

      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(/podcast-episode\.mp4/i),
        ).toBeInTheDocument();
      });

      // Com duração de 180s -> 3 créditos necessários. O usuário tem apenas 1 crédito.
      await waitFor(() => {
        expect(
          screen.getByText(/saldo insuficiente: você possui 1 crédito, mas este vídeo requer 3 créditos/i),
        ).toBeInTheDocument();
      });

      const uploadBtn = screen.getByRole("button", {
        name: /enviar e gerar cortes/i,
      });
      expect(uploadBtn).toBeDisabled();

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });
  });

  describe("4. Upload de Arquivo MP4 com sucesso", () => {
    it("deve realizar o fluxo completo de upload quando há créditos suficientes", async () => {
      vi.mocked(generateUploadUrl).mockResolvedValueOnce({
        success: true,
        signedUrl: "https://s3.amazonaws.com/test-bucket/signed-url",
        key: "test-key",
        uploadedFileId: "uploaded-123",
      });

      vi.mocked(processVideo).mockResolvedValueOnce();

      const onUploadSuccess = vi.fn();
      const { container } = render(
        <ImportVideoTabs userCredits={10} onUploadSuccess={onUploadSuccess} />,
      );

      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(["dummy-video-data"], "my-interview.mp4", {
        type: "video/mp4",
      });

      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/my-interview\.mp4/i)).toBeInTheDocument();
      });

      const uploadBtn = screen.getByRole("button", {
        name: /enviar e gerar cortes/i,
      });
      expect(uploadBtn).not.toBeDisabled();

      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(generateUploadUrl).toHaveBeenCalledWith({
          filename: "my-interview.mp4",
          contentType: "video/mp4",
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://s3.amazonaws.com/test-bucket/signed-url",
        expect.objectContaining({
          method: "PUT",
          body: file,
        }),
      );

      expect(processVideo).toHaveBeenCalledWith("uploaded-123", "HORMOZI");
      expect(toast.success).toHaveBeenCalledWith(
        "Vídeo enviado com sucesso!",
        expect.any(Object),
      );
      expect(onUploadSuccess).toHaveBeenCalled();
    });

    it("deve permitir remover o arquivo selecionado", async () => {
      const { container } = render(<ImportVideoTabs userCredits={10} />);

      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(["content"], "cancel-me.mp4", { type: "video/mp4" });

      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/cancel-me\.mp4/i)).toBeInTheDocument();
      });

      const removeBtn = screen.getByRole("button", { name: /remover/i });
      fireEvent.click(removeBtn);

      expect(screen.queryByText(/cancel-me\.mp4/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /enviar e gerar cortes/i }),
      ).toBeDisabled();
    });

    it("deve rejeitar arquivo local com erro se duração exceder 2h no plano STARTER", async () => {
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:mock-long-url");
      URL.revokeObjectURL = vi.fn();

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName === "video") {
          const videoElement = originalCreateElement("video");
          Object.defineProperty(videoElement, "duration", {
            value: 8000, // > 7200s (2h)
            writable: true,
          });
          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event("loadedmetadata"));
            }
          }, 0);
          return videoElement;
        }
        return originalCreateElement(tagName);
      });

      const { container } = render(<ImportVideoTabs userCredits={200} userPlan="STARTER" />);
      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(["long-video"], "too-long.mp4", { type: "video/mp4" });

      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining("excede o limite de 2h")
        );
      });

      // O arquivo não deve ficar selecionado
      expect(screen.queryByText(/too-long\.mp4/i)).not.toBeInTheDocument();

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it("deve rejeitar arquivo se tamanho for maior que 2 GB", async () => {
      const { container } = render(<ImportVideoTabs userCredits={50} />);
      const fileInput = container.querySelector('input[type="file"]');

      const hugeFile = new File(["dummy"], "huge-file.mp4", { type: "video/mp4" });
      Object.defineProperty(hugeFile, "size", {
        value: 3 * 1024 * 1024 * 1024, // 3 GB
      });

      fireEvent.change(fileInput!, { target: { files: [hugeFile] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining("2 GB")
        );
      });

      expect(screen.queryByText(/huge-file\.mp4/i)).not.toBeInTheDocument();
    });
  });
  describe("5. Modo de Corte Manual", () => {
    it("deve alternar entre Auto IA e Corte Manual e renderizar campos iniciais", () => {
      render(<ImportVideoTabs userCredits={10} />);
      
      // Inicialmente em Auto IA
      expect(screen.getByRole("button", { name: /auto ia \(recomendado\)/i })).toBeInTheDocument();
      const manualModeBtn = screen.getByRole("button", { name: /corte manual preciso/i });
      expect(manualModeBtn).toBeInTheDocument();
      
      fireEvent.click(manualModeBtn);
      
      // Verifica campos iniciais do corte manual
      expect(screen.getByPlaceholderText("Título opcional (ex: Gancho)")).toBeInTheDocument();
      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument(); // Start input
      expect(screen.getByDisplayValue("00:30")).toBeInTheDocument(); // End input
      expect(screen.getByRole("button", { name: /\+25s/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /\+30s/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /\+60s/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /adicionar outro corte/i })).toBeInTheDocument();
    });

    it("deve calcular o tempo final automaticamente ao usar quick chips", () => {
      render(<ImportVideoTabs userCredits={10} />);
      fireEvent.click(screen.getByRole("button", { name: /corte manual preciso/i }));
      
      // Atualiza start para "01:00"
      const startInputs = screen.getAllByPlaceholderText("00:00");
      fireEvent.change(startInputs[0]!, { target: { value: "01:00" } });
      
      // Clica em +30s
      fireEvent.click(screen.getByRole("button", { name: /\+30s/i }));
      
      // End input deve ser "01:30"
      const endInputs = screen.getAllByPlaceholderText("00:30");
      expect(endInputs[0]!).toHaveValue("01:30");
      
      // Clica em +60s
      fireEvent.click(screen.getByRole("button", { name: /\+60s/i }));
      expect(endInputs[0]!).toHaveValue("02:00");
    });

    it("deve permitir adicionar e remover cortes manuais e validar créditos", () => {
      render(<ImportVideoTabs userCredits={2} />); switchToTab(/link do youtube/i);
      fireEvent.click(screen.getByRole("button", { name: /corte manual preciso/i }));
      
      // Adiciona um segundo corte
      fireEvent.click(screen.getByRole("button", { name: /adicionar outro corte/i }));
      
      let startInputs = screen.getAllByPlaceholderText("00:00");
      expect(startInputs.length).toBe(2);
      
      // Cada corte tem 30s (00:00 a 00:30) = 1 crédito por corte. Total 2.
      // Testa aviso de saldo insuficiente se adicionar um 3º corte (1 crédito extra)
      fireEvent.click(screen.getByRole("button", { name: /adicionar outro corte/i }));
      expect(screen.getByText(/saldo insuficiente: você possui 2 créditos, mas os cortes manuais requerem 3 créditos/i)).toBeInTheDocument();
      
      // Remove o terceiro corte
      const removeButtons = screen.getAllByRole("button", { name: /remover/i });
      fireEvent.click(removeButtons[2]!);
      
      // Alerta deve sumir
      expect(screen.queryByText(/saldo insuficiente/i)).not.toBeInTheDocument();
    });

    it("deve enviar payload de cortes manuais ao importar do youtube", async () => {
      vi.mocked(importYouTubeVideo).mockResolvedValueOnce({
        success: true,
        uploadedFileId: "file-123",
      });

      render(<ImportVideoTabs userCredits={10} />);
      switchToTab(/link do youtube/i);
      
      // Insere URL válida
      const input = screen.getByPlaceholderText(/youtube\.com/i);
      fireEvent.change(input, { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
      
      // Modo manual
      fireEvent.click(screen.getByRole("button", { name: /corte manual preciso/i }));
      
      // Edita o primeiro corte
      const titleInput = screen.getByPlaceholderText("Título opcional (ex: Gancho)");
      fireEvent.change(titleInput, { target: { value: "Intro" } });
      
      // Submit
      fireEvent.click(screen.getByRole("button", { name: /importar do youtube/i }));
      
      await waitFor(() => {
        expect(importYouTubeVideo).toHaveBeenCalledWith({
          url: "https://youtu.be/dQw4w9WgXcQ",
          preset: "HORMOZI",
          mode: "manual",
          manualCuts: [
            { title: "Intro", startTime: 0, endTime: 30 }
          ]
        });
      });
    });

    it("deve enviar payload de cortes manuais ao realizar upload local", async () => {
      vi.mocked(generateUploadUrl).mockResolvedValueOnce({
        success: true,
        signedUrl: "https://s3.amazonaws.com/test-bucket/signed-url",
        key: "test-key",
        uploadedFileId: "uploaded-456",
      });

      vi.mocked(processVideo).mockResolvedValueOnce();

      const { container } = render(<ImportVideoTabs userCredits={10} />);
      
      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(["dummy"], "video.mp4", { type: "video/mp4" });
      fireEvent.change(fileInput!, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/video\.mp4/i)).toBeInTheDocument();
      });

      // Modo manual
      fireEvent.click(screen.getByRole("button", { name: /corte manual preciso/i }));
      
      // Submit
      const uploadBtn = screen.getByRole("button", { name: /enviar e gerar cortes/i });
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(processVideo).toHaveBeenCalledWith(
          "uploaded-456",
          "HORMOZI",
          "manual",
          [ { title: "", startTime: 0, endTime: 30 } ]
        );
      });
    });
  });
});
