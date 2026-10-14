import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClipCard } from "~/components/clip-card";
import { deleteClip } from "~/actions/generation";
import { toast } from "sonner";
import type { Clip } from "@prisma/client";

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({
    success: true,
    url: "https://example.com/clip.mp4",
  }),
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
  id: "clip-1",
  s3Key: "test.mp4",
  title: "Test Clip",
  hook: "Test hook",
  viralityScore: 8.5,
  reason: "Test reason",
  startTime: 0,
  endTime: 30,
  sourceStartTime: null,
  sourceEndTime: null,
  durationSeconds: 30,
  subtitlePreset: "NEON",
  layoutMode: "SMART_CROP",
  transcriptWords: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  uploadedFileId: "file-1",
  userId: "user-1",
};

const TRIGGER_NAME = "Excluir clipe permanentemente";

describe("ClipCard - exclusão com confirmação acessível (WCAG 3.3.4 / 4.1.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não usa window.confirm nativo: abre um alertdialog com nome acessível", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ClipCard clip={mockClip} />);

    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Excluir clipe?");
    expect(deleteClip).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("confirmar no alertdialog chama deleteClip e notifica o pai", async () => {
    const onDeleteMock = vi.fn();
    vi.mocked(deleteClip).mockResolvedValueOnce({ success: true } as any);

    render(<ClipCard clip={mockClip} onDelete={onDeleteMock} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir clipe" }));

    expect(deleteClip).toHaveBeenCalledWith("clip-1");
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Clipe excluído com sucesso!");
      expect(onDeleteMock).toHaveBeenCalledWith("clip-1");
    });
  });

  it("cancelar no alertdialog não chama deleteClip", () => {
    const onDeleteMock = vi.fn();
    render(<ClipCard clip={mockClip} onDelete={onDeleteMock} />);

    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(deleteClip).not.toHaveBeenCalled();
    expect(onDeleteMock).not.toHaveBeenCalled();
  });

  it("exibe toast de erro se a exclusão falhar", async () => {
    vi.mocked(deleteClip).mockResolvedValueOnce({
      success: false,
      error: "Falha na exclusão do S3",
    } as any);

    render(<ClipCard clip={mockClip} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir clipe" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Falha na exclusão do S3");
    });
  });
});
