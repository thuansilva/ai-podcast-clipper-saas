import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClipCard } from "~/components/clip-card";
import { getClipPlayUrl, deleteClip, updateClip } from "~/actions/generation";
import { toast } from "sonner";
import type { Clip } from "@prisma/client";

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn(),
  deleteClip: vi.fn(),
  updateClip: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockClip: Clip = {
  id: "clip-test-1",
  s3Key: "uploads/test/clip_1.mp4",
  title: "Como criar uma startup viral",
  hook: "O maior segredo que ninguém te conta",
  viralityScore: 9.5,
  reason: "Forte gatilho de curiosidade com retenção nos primeiros 3 segundos",
  startTime: 10.0,
  endTime: 45.0,
  durationSeconds: 35.0,
  subtitlePreset: "HORMOZI",
  layoutMode: "SMART_CROP",
  transcriptWords: [
    { word: "O", start: 10.0, end: 10.3 },
    { word: "maior", start: 10.3, end: 10.7 },
    { word: "segredo", start: 10.7, end: 11.2 },
  ],
  createdAt: new Date("2026-09-11T00:00:00Z"),
  updatedAt: new Date("2026-09-11T00:00:00Z"),
  uploadedFileId: "file-test-1",
  userId: "user-123",
};

describe("ClipCard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClipPlayUrl).mockResolvedValue({
      success: true,
      succes: true,
      url: "https://s3.example.com/mock-clip.mp4",
    });
    vi.mocked(deleteClip).mockResolvedValue({ success: true });
    vi.mocked(updateClip).mockResolvedValue({ success: true });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("deve renderizar o título, badge de score de viralidade, duração, hook e preset", async () => {
    render(<ClipCard clip={mockClip} />);

    expect(screen.getByText("Como criar uma startup viral")).toBeInTheDocument();
    expect(screen.getByText("🔥 9.5/10")).toBeInTheDocument();
    expect(screen.getByText("35s")).toBeInTheDocument();
    expect(screen.getByText(/O maior segredo que ninguém te conta/i)).toBeInTheDocument();
    expect(screen.getByText("HORMOZI")).toBeInTheDocument();
    expect(screen.getByText(/Forte gatilho de curiosidade/i)).toBeInTheDocument();
  });

  it("deve carregar e exibir o player vertical 9:16 com a URL retornada", async () => {
    render(<ClipCard clip={mockClip} />);

    await waitFor(() => {
      const video = screen.getByLabelText(/Vídeo do clipe Como criar uma startup viral/i);
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("src", "https://s3.example.com/mock-clip.mp4");
    });
  });

  it("deve copiar o hook para a área de transferência ao clicar em 'Copiar Hook'", async () => {
    render(<ClipCard clip={mockClip} />);

    const copyBtn = screen.getByRole("button", { name: /copiar hook/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "O maior segredo que ninguém te conta",
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Hook copiado para a área de transferência!",
      );
    });
  });

  it("deve acionar o download do clipe ao clicar no botão de Download", async () => {
    render(<ClipCard clip={mockClip} />);

    // Aguardar carregamento da playUrl
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^download$/i })).not.toBeDisabled();
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const downloadBtn = screen.getByRole("button", { name: /^download$/i });
    fireEvent.click(downloadBtn);

    expect(clickSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Download iniciado!");
    clickSpy.mockRestore();
  });

  it("deve abrir o modal de edição ao clicar em Editar e salvar alterações", async () => {
    render(<ClipCard clip={mockClip} />);

    const editBtn = screen.getByRole("button", { name: /editar/i });
    fireEvent.click(editBtn);

    // Modal deve estar visível
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Editar Legendas e Transcrição/i)).toBeInTheDocument();

    // Selecionar preset NEON
    const neonPresetBtn = screen.getByRole("button", { name: /neon/i });
    fireEvent.click(neonPresetBtn);

    // Editar transcrição
    const textarea = screen.getByTestId("transcript-input");
    fireEvent.change(textarea, { target: { value: "O maior segredo incrível" } });

    // Salvar
    const saveBtn = screen.getByRole("button", { name: /salvar e re-renderizar/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateClip).toHaveBeenCalledWith(
        "clip-test-1",
        expect.objectContaining({
          subtitlePreset: "NEON",
          transcriptWords: expect.arrayContaining([
            expect.objectContaining({ word: "O" }),
            expect.objectContaining({ word: "maior" }),
            expect.objectContaining({ word: "segredo" }),
            expect.objectContaining({ word: "incrível" }),
          ]),
        }),
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Alterações salvas! Re-renderização iniciada.",
      );
    });
  });

  it("deve solicitar confirmação e chamar deleteClip ao clicar em Excluir", async () => {
    const onDeleteMock = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ClipCard clip={mockClip} onDelete={onDeleteMock} />);

    const deleteBtn = screen.getByRole("button", { name: /excluir/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("Tem certeza que deseja excluir este clipe?"),
    );
    expect(deleteClip).toHaveBeenCalledWith("clip-test-1");

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Clipe excluído com sucesso!");
      expect(onDeleteMock).toHaveBeenCalledWith("clip-test-1");
    });

    confirmSpy.mockRestore();
  });

  it("não deve chamar deleteClip se o usuário cancelar a confirmação de exclusão", async () => {
    const onDeleteMock = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ClipCard clip={mockClip} onDelete={onDeleteMock} />);

    const deleteBtn = screen.getByRole("button", { name: /excluir/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteClip).not.toHaveBeenCalled();
    expect(onDeleteMock).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("deve exibir toast de erro se a exclusão falhar", async () => {
    vi.mocked(deleteClip).mockResolvedValueOnce({
      success: false,
      error: "Falha na exclusão do S3",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ClipCard clip={mockClip} />);

    const deleteBtn = screen.getByRole("button", { name: /excluir/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Falha na exclusão do S3");
    });

    confirmSpy.mockRestore();
  });
});
