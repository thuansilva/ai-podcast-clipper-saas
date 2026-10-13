import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { Clip } from "@prisma/client";
import { ClipDetailsModal } from "~/components/clip-details-modal";

vi.mock("~/components/custom-video-player", () => ({
  CustomVideoPlayer: () => <div data-testid="player" />,
}));

const clip = {
  id: "clip-1",
  s3Key: "clip.mp4",
  title: "Clip de teste",
  hook: "Gancho",
  viralityScore: 8,
  reason: "Motivo",
  startTime: 0,
  endTime: 30,
  durationSeconds: 30,
  subtitlePreset: "NEON",
  layoutMode: "SMART_CROP",
  transcriptWords: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  uploadedFileId: "file-1",
  userId: "user-1",
} as unknown as Clip;

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir detalhes
      </button>
      <ClipDetailsModal
        clip={clip}
        playUrl={null}
        isLoadingUrl={false}
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      />
    </>
  );
}

function openModal() {
  const trigger = screen.getByRole("button", { name: "Abrir detalhes" });
  act(() => trigger.focus());
  fireEvent.click(trigger);
  return trigger;
}

describe("ClipDetailsModal - Accessibility (WCAG 2.1 AA)", () => {
  it("expõe role=dialog com nome acessível vindo do título (WCAG 4.1.2)", () => {
    render(<Harness />);
    openModal();
    expect(screen.getByRole("dialog", { name: "Detalhes do Clipe" })).toBeInTheDocument();
  });

  it("o botão Fechar (X) fecha o modal por clique (WCAG 4.1.2)", async () => {
    render(<Harness />);
    openModal();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Escape fecha o modal (WCAG 2.1.1 Keyboard)", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openModal();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("o foco permanece dentro do modal enquanto aberto (WCAG 2.4.3 Focus Order)", () => {
    render(<Harness />);
    openModal();
    const dialog = screen.getByRole("dialog");

    // Tenta sair do modal focando um elemento externo.
    const outside = screen.getByRole("button", { name: "Abrir detalhes", hidden: true });
    act(() => outside.focus());

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("ao fechar, o foco volta para o elemento que abriu o modal (WCAG 2.4.3)", async () => {
    render(<Harness />);
    const trigger = openModal();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    // O Radix devolve o foco no próximo tick após desmontar o conteúdo.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
