import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = `NEXT_REDIRECT;${url}`;
    throw error;
  }),
}));

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUnique: vi.fn(),
    },
    clip: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    projectProcessingBatch: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

const project = {
  id: "proj-yt",
  userId: "user-1",
  displayName: "Podcast do YouTube",
  durationSeconds: 300,
  status: "processed",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
  thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  _count: { clips: 0 },
  clips: [],
};

async function renderProjectPage() {
  const result = await ProjectDetailsPage({
    params: Promise.resolve({ id: "proj-yt" }),
    searchParams: Promise.resolve({}),
  });
  render(result);
}

describe("ProjectDetailsPage (card do vídeo original e header) - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);
    vi.mocked(db.clip.aggregate).mockResolvedValue({ _sum: { durationSeconds: null } } as any);
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue(project as any);
  });

  it("o botão de ícone do vídeo original tem nome acessível e é um botão de popover (WCAG 4.1.2)", async () => {
    await renderProjectPage();

    const trigger = screen.getByRole("button", { name: "Ver vídeo original" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger.className).toMatch(/focus-visible:ring/);
  });

  it("o link do YouTube que abre em nova aba avisa isso no nome acessível (WCAG 3.2.5 / G201)", async () => {
    await renderProjectPage();
    fireEvent.click(screen.getByTestId("original-video-trigger"));

    const link = screen.getByTestId("original-video-youtube-link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName(/nova aba/i);
    expect(link).toHaveAccessibleName(/Assistir no YouTube/i);
  });

  it("a thumbnail do vídeo original tem alt descritivo, não genérico (WCAG 1.1.1)", async () => {
    await renderProjectPage();
    fireEvent.click(screen.getByTestId("original-video-trigger"));

    const thumb = screen.getByAltText(/Thumbnail do vídeo original: Podcast do YouTube/i);
    expect(thumb).not.toHaveAttribute("alt", "Thumbnail");
    expect(thumb).not.toHaveAttribute("alt", "");
  });

  it("o campo de busca tem rótulo acessível e o formulário é um landmark de busca (WCAG 1.3.1 / 3.3.2)", async () => {
    await renderProjectPage();

    expect(screen.getByRole("searchbox", { name: "Buscar cortes" })).toBeDefined();
    expect(screen.getByRole("search")).toBeDefined();
  });

  it("o botão 'Adicionar cortes' do header tem texto acessível e indicador de foco visível (WCAG 2.4.7 / 4.1.2)", async () => {
    await renderProjectPage();

    const addClips = screen.getByRole("link", { name: /Adicionar cortes/i });
    expect(addClips).toHaveAttribute("href", "/dashboard/projects/proj-yt/add-clips");
    expect(addClips.className).toMatch(/focus-visible:ring/);
  });
});
