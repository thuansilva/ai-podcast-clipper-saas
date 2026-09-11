import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipDisplay } from "~/components/clip-display";
import type { Clip } from "@prisma/client";

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({
    success: true,
    succes: true,
    url: "https://s3.example.com/clip.mp4",
  }),
  deleteClip: vi.fn().mockResolvedValue({ success: true }),
  updateClip: vi.fn().mockResolvedValue({ success: true }),
}));

const mockClips: Clip[] = [
  {
    id: "clip-1",
    s3Key: "uploads/1/clip_1.mp4",
    title: "Primeiro Corte Viral",
    hook: "Aprenda isso agora",
    viralityScore: 9.8,
    reason: "Curiosidade imediata",
    startTime: 0,
    endTime: 30,
    durationSeconds: 30,
    subtitlePreset: "HORMOZI",
    layoutMode: "SMART_CROP",
    transcriptWords: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    uploadedFileId: "f-1",
    userId: "u-1",
  },
  {
    id: "clip-2",
    s3Key: "uploads/1/clip_2.mp4",
    title: "Segundo Corte Viral",
    hook: "O segredo do sucesso",
    viralityScore: 8.5,
    reason: "Gatilho de autoridade",
    startTime: 35,
    endTime: 65,
    durationSeconds: 30,
    subtitlePreset: "MINIMAL",
    layoutMode: "SMART_CROP",
    transcriptWords: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    uploadedFileId: "f-1",
    userId: "u-1",
  },
];

describe("ClipDisplay Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar estado vazio quando a lista de clipes for vazia", () => {
    render(<ClipDisplay clips={[]} />);

    expect(screen.getByText("Nenhum clipe gerado ainda")).toBeInTheDocument();
    expect(
      screen.getByText(/Envie um arquivo de vídeo ou importe um link do YouTube/i),
    ).toBeInTheDocument();
  });

  it("deve renderizar múltiplos ClipCards quando houver clipes", () => {
    render(<ClipDisplay clips={mockClips} />);

    expect(screen.getByText("Primeiro Corte Viral")).toBeInTheDocument();
    expect(screen.getByText("🔥 9.8/10")).toBeInTheDocument();

    expect(screen.getByText("Segundo Corte Viral")).toBeInTheDocument();
    expect(screen.getByText("🔥 8.5/10")).toBeInTheDocument();
  });
});
