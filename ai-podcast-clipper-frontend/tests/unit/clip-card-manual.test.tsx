import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipCard } from "~/components/clip-card";
import type { Clip } from "@prisma/client";

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({ success: true, url: "https://x/c.mp4" }),
  deleteClip: vi.fn(),
  updateClip: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: Clip = {
  id: "c1",
  s3Key: "k.mp4",
  title: "Meu corte",
  hook: "gancho",
  viralityScore: 8.5,
  reason: "motivo",
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
  uploadedFileId: "f1",
  userId: "u1",
};

describe("ClipCard - corte manual", () => {
  it("mostra 'Corte Manual' como texto real e não mostra porcentagem nem '--'", () => {
    render(
      <ClipCard
        clip={{ ...base, viralityScore: null, hook: null, reason: null }}
        isManual
      />,
    );
    expect(screen.getByText("Corte Manual")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("clipe automático continua mostrando a porcentagem (regressão)", () => {
    render(<ClipCard clip={base} />);
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.queryByText("Corte Manual")).not.toBeInTheDocument();
  });
});
