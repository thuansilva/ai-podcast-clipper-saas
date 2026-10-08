import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Clip } from "@prisma/client";
import { ClipEditorModal } from "~/components/clip-editor-modal";
import { updateClip } from "~/actions/generation";

vi.mock("~/actions/generation", () => ({
  updateClip: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseClip: Clip = {
  id: "clip-1",
  s3Key: "uploads/test/clip_1.mp4",
  title: "Como criar uma startup viral",
  hook: "O maior segredo que ninguém te conta",
  viralityScore: 9.5,
  reason: "Forte gatilho de curiosidade",
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

/**
 * Harness que reproduz a mesma estratégia usada pelo componente pai real
 * (`clip-card.tsx`): monta uma instância nova de `ClipEditorModal` (via
 * `key`) sempre que o modal transiciona de fechado para aberto, para que o
 * formulário sempre inicialize com os dados atuais do clipe em vez de
 * preservar estado de uma abertura anterior.
 */
function ClipEditorModalHarness({ clip }: { clip: Clip }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Abrir editor
      </button>
      <ClipEditorModal
        key={isOpen ? `editor-open-${clip.id}` : "editor-closed"}
        clip={clip}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

describe("ClipEditorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateClip).mockResolvedValue({ success: true });
  });

  it("não renderiza nada quando isOpen é false", () => {
    render(<ClipEditorModal clip={baseClip} isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("inicializa o preset e a transcrição a partir do clipe quando aberto", () => {
    render(<ClipEditorModal clip={baseClip} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const textarea = screen.getByTestId("transcript-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("O maior segredo");

    // Preset inicial (HORMOZI) deve estar marcado visualmente (ring/active)
    const hormoziBtn = screen.getByRole("button", { name: /hormozi/i });
    expect(hormoziBtn.className).toMatch(/ring-1/);
  });

  it("descarta edições não salvas ao fechar e reabrir o modal (via remount por key)", () => {
    render(<ClipEditorModalHarness clip={baseClip} />);

    fireEvent.click(screen.getByRole("button", { name: /abrir editor/i }));

    const textarea = screen.getByTestId("transcript-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("O maior segredo");

    // Usuário edita a transcrição e troca o preset, mas não salva
    fireEvent.change(textarea, { target: { value: "Rascunho não salvo" } });
    fireEvent.click(screen.getByRole("button", { name: /neon/i }));

    // Fecha sem salvar
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reabre: deve refletir os dados originais do clipe, não o rascunho
    fireEvent.click(screen.getByRole("button", { name: /abrir editor/i }));

    const reopenedTextarea = screen.getByTestId(
      "transcript-input",
    ) as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe("O maior segredo");

    const hormoziBtn = screen.getByRole("button", { name: /hormozi/i });
    expect(hormoziBtn.className).toMatch(/ring-1/);
  });

  it("salva o preset e a transcrição editados ao clicar em Salvar", async () => {
    render(<ClipEditorModal clip={baseClip} isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /neon/i }));

    const textarea = screen.getByTestId("transcript-input");
    fireEvent.change(textarea, { target: { value: "Novo texto editado" } });

    fireEvent.click(screen.getByRole("button", { name: /salvar e re-renderizar/i }));

    await waitFor(() => {
      expect(updateClip).toHaveBeenCalledWith(
        "clip-1",
        expect.objectContaining({
          subtitlePreset: "NEON",
          transcriptWords: expect.arrayContaining([
            expect.objectContaining({ word: "Novo" }),
            expect.objectContaining({ word: "texto" }),
            expect.objectContaining({ word: "editado" }),
          ]),
        }),
      );
    });
  });
});
