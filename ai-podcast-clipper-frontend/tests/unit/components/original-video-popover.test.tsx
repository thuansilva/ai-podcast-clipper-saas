import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OriginalVideoPopover } from "~/components/dashboard/original-video-popover";

const baseProps = {
  displayName: "Podcast do YouTube",
  durationMinutes: 5,
  thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  youtubeCanonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

describe("OriginalVideoPopover", () => {
  it("renderiza só o chip 'Vídeo original' (sem a duração) e mantém o conteúdo escondido até o clique", () => {
    render(<OriginalVideoPopover {...baseProps} />);

    const trigger = screen.getByTestId("original-video-trigger");
    expect(trigger).toHaveTextContent(/^Vídeo original$/);
    expect(screen.queryByTestId("original-video-card")).toBeNull();
    expect(screen.queryByTestId("original-video-youtube-link")).toBeNull();
  });

  it("ao clicar mostra thumbnail, título, duração e link de texto (sem URL crua)", () => {
    render(<OriginalVideoPopover {...baseProps} />);
    fireEvent.click(screen.getByTestId("original-video-trigger"));

    expect(screen.getByTestId("original-video-card")).toBeDefined();
    expect(screen.getByText("5 min de duração")).toBeDefined();
    expect(
      screen.getByAltText(/Thumbnail do vídeo original: Podcast do YouTube/i),
    ).toHaveAttribute("src", baseProps.thumbnailUrl);

    const link = screen.getByTestId("original-video-youtube-link");
    expect(link).toHaveAttribute("href", baseProps.youtubeCanonicalUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toContain("Assistir no YouTube");
    expect(link.textContent).not.toMatch(/youtube\.com|youtu\.be|https?:/i);
    expect(link).toHaveAccessibleName(/nova aba/i);
  });

  it("não renderiza o link quando não há URL válida do YouTube", () => {
    render(<OriginalVideoPopover {...baseProps} youtubeCanonicalUrl={null} />);
    fireEvent.click(screen.getByTestId("original-video-trigger"));

    expect(screen.getByTestId("original-video-card")).toBeDefined();
    expect(screen.queryByTestId("original-video-youtube-link")).toBeNull();
  });

  it("usa placeholder (sem img) quando não há thumbnail", () => {
    render(
      <OriginalVideoPopover {...baseProps} thumbnailUrl={null} />,
    );
    fireEvent.click(screen.getByTestId("original-video-trigger"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("original-video-card")).toBeDefined();
  });
});
