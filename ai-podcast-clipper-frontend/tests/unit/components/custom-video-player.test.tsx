import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomVideoPlayer } from "~/components/custom-video-player";

function getOuterWrapper(container: HTMLElement) {
  return container.querySelector(".group.bg-black") as HTMLElement;
}

function getCenterIconWrapper(container: HTMLElement) {
  return container.querySelector(".absolute.inset-0") as HTMLElement;
}

function getProgressFill(container: HTMLElement) {
  return container.querySelector('[style*="width"]') as HTMLElement;
}

describe("CustomVideoPlayer", () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("alterna entre play e pause ao clicar no player", () => {
    const { container } = render(
      <CustomVideoPlayer src="https://example.com/video.mp4" />,
    );

    const outerWrapper = getOuterWrapper(container);

    // Estado inicial: pausado (ícone central visível, sem opacity-0)
    expect(getCenterIconWrapper(container).className).not.toMatch(/opacity-0/);

    fireEvent.click(outerWrapper);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(getCenterIconWrapper(container).className).toMatch(/opacity-0/);

    fireEvent.click(outerWrapper);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(getCenterIconWrapper(container).className).not.toMatch(/opacity-0/);
  });

  it("alterna o mute ao clicar no botão de volume", () => {
    render(<CustomVideoPlayer src="https://example.com/video.mp4" />);

    expect(screen.getByLabelText(/^mute$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^mute$/i));

    expect(screen.getByLabelText(/^unmute$/i)).toBeInTheDocument();
  });

  it("atualiza a barra de progresso conforme o vídeo reproduz e reseta ao terminar", () => {
    const { container } = render(
      <CustomVideoPlayer src="https://example.com/video.mp4" />,
    );

    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 100, configurable: true });
    Object.defineProperty(video, "currentTime", {
      value: 50,
      configurable: true,
      writable: true,
    });

    fireEvent.timeUpdate(video);
    expect(getProgressFill(container).style.width).toBe("50%");

    fireEvent.ended(video);
    expect(getProgressFill(container).style.width).toBe("100%");
    expect(getCenterIconWrapper(container).className).not.toMatch(/opacity-0/);
  });

  it(
    "mantém isPlaying e progresso resetados em uma nova instância quando o " +
      "componente pai remonta com `key={src}` (troca de vídeo)",
    () => {
      function Harness() {
        const [src, setSrc] = useState("https://example.com/video-1.mp4");
        return (
          <>
            <button
              type="button"
              onClick={() => setSrc("https://example.com/video-2.mp4")}
            >
              Trocar vídeo
            </button>
            <CustomVideoPlayer key={src} src={src} />
          </>
        );
      }

      const { container } = render(<Harness />);

      const video = () => container.querySelector("video")!;

      // Reproduz o primeiro vídeo e avança o progresso
      Object.defineProperty(video(), "duration", {
        value: 100,
        configurable: true,
      });
      Object.defineProperty(video(), "currentTime", {
        value: 70,
        configurable: true,
        writable: true,
      });
      fireEvent.click(getOuterWrapper(container));
      fireEvent.timeUpdate(video());

      expect(getCenterIconWrapper(container).className).toMatch(/opacity-0/);
      expect(getProgressFill(container).style.width).toBe("70%");

      // Troca para um novo vídeo (remonta via key)
      fireEvent.click(screen.getByRole("button", { name: /trocar vídeo/i }));

      expect(video().getAttribute("src")).toBe(
        "https://example.com/video-2.mp4",
      );
      expect(getProgressFill(container).style.width).toBe("0%");
      expect(getCenterIconWrapper(container).className).not.toMatch(
        /opacity-0/,
      );
    },
  );
});
