import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { Clip } from "@prisma/client";
import { ClipCard } from "~/components/clip-card";
import { deleteClip } from "~/actions/generation";

// Integração de UI: os componentes reais (ClipCard, CustomVideoPlayer,
// ClipDetailsModal, ClipEditorModal e AlertDialog de exclusão) são compostos
// juntos. Só as server actions são substituídas, porque não há banco/HTTP
// envolvidos neste fluxo. Os seletores são por role e nome acessível (estáveis
// para um e2e futuro), não por classe CSS.

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({
    success: true,
    url: "https://example.com/clip.mp4",
  }),
  deleteClip: vi.fn(),
  updateClip: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const clip = {
  id: "clip-int-1",
  s3Key: "clip.mp4",
  title: "Clipe de integração",
  hook: "Gancho",
  viralityScore: 9,
  reason: "Motivo de viralização",
  startTime: 0,
  endTime: 30,
  durationSeconds: 30,
  subtitlePreset: "NEON",
  layoutMode: "SMART_CROP",
  transcriptWords: [{ word: "olá", start: 0, end: 1 }],
  createdAt: new Date(),
  updatedAt: new Date(),
  uploadedFileId: "file-1",
  userId: "user-1",
} as unknown as Clip;

const INFO_BUTTON = "Ver detalhes e transcrição";
const EDIT_BUTTON = "Editar clipe e legendas";
const DELETE_BUTTON = "Excluir clipe permanentemente";

function focusAndClick(name: string) {
  const button = screen.getByRole("button", { name });
  act(() => button.focus());
  fireEvent.click(button);
  return button;
}

describe("ClipCard - fluxos de diálogo compostos (integração de UI, a11y)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("Detalhes: abre o diálogo, Escape fecha e o foco volta ao botão de detalhes", async () => {
    render(<ClipCard clip={clip} />);
    const trigger = focusAndClick(INFO_BUTTON);

    expect(await screen.findByRole("dialog", { name: "Detalhes do Clipe" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Detalhes do Clipe" })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Editor: abre o diálogo de legendas, Escape fecha e o foco volta ao botão de editar", async () => {
    render(<ClipCard clip={clip} />);
    const trigger = focusAndClick(EDIT_BUTTON);

    expect(
      await screen.findByRole("dialog", { name: /Editar Legendas e Transcrição/ }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Exclusão: confirmar no AlertDialog chama deleteClip e notifica o pai", async () => {
    const onDelete = vi.fn();
    vi.mocked(deleteClip).mockResolvedValueOnce({ success: true } as any);

    render(<ClipCard clip={clip} onDelete={onDelete} />);
    focusAndClick(DELETE_BUTTON);

    const confirm = await screen.findByRole("button", { name: "Excluir clipe" });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(deleteClip).toHaveBeenCalledWith("clip-int-1");
      expect(onDelete).toHaveBeenCalledWith("clip-int-1");
    });
  });

  it("Exclusão cancelada: não chama deleteClip e devolve o foco ao botão de excluir", async () => {
    render(<ClipCard clip={clip} />);
    const trigger = focusAndClick(DELETE_BUTTON);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(deleteClip).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
