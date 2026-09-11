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
  });
});
