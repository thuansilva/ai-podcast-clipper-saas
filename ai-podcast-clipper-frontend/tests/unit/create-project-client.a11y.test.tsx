import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/actions/youtube", () => ({
  importYouTubeVideo: vi.fn(),
}));

vi.mock("~/actions/projects-actions", () => ({
  retryProjectAction: vi.fn(),
}));

const mockOptions = {
  genre: [{ value: "podcast", label: "Podcast", description: "", type: "genre" }],
  clipModel: [{ value: "gemini", label: "Gemini", description: "", type: "model" }],
  aspectRatio: [{ value: "9:16", label: "9:16", description: "", type: "aspect" }],
} as any;

describe("CreateProjectClient - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    // O Slider do Radix usa ResizeObserver, que o jsdom não implementa.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("o campo de URL do YouTube tem nome acessível, não só placeholder (WCAG 3.3.2 / 4.1.2)", () => {
    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    expect(
      screen.getByRole("textbox", { name: /link do vídeo do youtube/i }),
    ).toBeInTheDocument();
  });

  it("a miniatura tem texto alternativo descritivo, não o genérico 'Thumbnail' (WCAG 1.1.1)", () => {
    render(
      <CreateProjectClient
        isConfigRoute={false}
        userCredits={10}
        options={mockOptions}
        initialMetadata={{
          title: "Episódio 42",
          durationSeconds: 3600,
          thumbnailUrl: "https://img.example.com/ep42.jpg",
        }}
      />,
    );

    const thumb = screen.getByRole("img", { name: /Episódio 42/ });
    expect(thumb).not.toHaveAttribute("alt", "Thumbnail");
  });

  it("o carregamento de metadados é anunciado a leitores de tela (WCAG 4.1.3 Status Messages)", async () => {
    // fetch nunca resolve: mantém o estado de carregamento ativo.
    (global.fetch as any).mockReturnValue(new Promise(() => undefined));

    render(<CreateProjectClient isConfigRoute={true} userCredits={10} options={mockOptions} />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /link do vídeo do youtube/i }),
      { target: { value: "https://www.youtube.com/watch?v=abc123xyz" } },
    );

    await waitFor(() => {
      const statuses = screen.getAllByRole("status");
      const loading = statuses.find((el) => /buscando informações do vídeo/i.test(el.textContent ?? ""));
      expect(loading).toBeDefined();
    });
  });
});
