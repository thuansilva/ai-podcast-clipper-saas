import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomVideoPlayer } from "~/components/custom-video-player";

describe("CustomVideoPlayer - Accessibility (WCAG 2.1 AA)", () => {
  const mockVideoSrc = "https://example.com/video.mp4";

  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  describe("WCAG 4.1.2: Mute button accessible name", () => {
    it("should have aria-label on mute button (BLOCKER #1)", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      // Rótulo em português, descrevendo a AÇÃO que o botão executa.
      expect(screen.getByRole("button", { name: "Desativar som" })).toBeInTheDocument();
    });

    it("muda o rótulo para 'Ativar som' quando o áudio está silenciado", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      fireEvent.click(screen.getByRole("button", { name: "Desativar som" }));
      expect(screen.getByRole("button", { name: "Ativar som" })).toBeInTheDocument();
    });
  });

  describe("WCAG 2.1.1: Keyboard accessible controls", () => {
    it("mute button should not rely solely on hover for visibility (BLOCKER #2)", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      const muteButton = screen.getByRole("button", { name: "Desativar som" });

      // Botão começa invisível (opacity-0 até hover), então precisa de
      // indicador de foco explícito para quem navega por teclado.
      expect(muteButton.className).toMatch(/opacity-0/);
      expect(muteButton.className).toMatch(/focus-visible:opacity-100/);
    });

    it("o controle principal de play/pause é um <button> nativo focável (não um div com onClick)", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      const playButton = screen.getByRole("button", { name: "Reproduzir vídeo" });
      expect(playButton.tagName).toBe("BUTTON");
      expect(playButton).not.toHaveAttribute("tabindex", "-1");
    });

    it("ativar o botão de play (teclado = clique nativo) reproduz e rotula como 'Pausar vídeo'", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      fireEvent.click(screen.getByRole("button", { name: "Reproduzir vídeo" }));

      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Pausar vídeo" })).toBeInTheDocument();
    });

    it("a barra de progresso é um slider acessível por teclado (ArrowRight avança 5s)", () => {
      const { container } = render(<CustomVideoPlayer src={mockVideoSrc} />);
      const video = container.querySelector("video")!;
      Object.defineProperty(video, "duration", { value: 100, configurable: true });
      Object.defineProperty(video, "currentTime", {
        value: 10,
        configurable: true,
        writable: true,
      });

      const slider = screen.getByRole("slider", { name: "Progresso do vídeo" });
      expect(slider).toHaveAttribute("tabindex", "0");
      expect(slider).toHaveAttribute("aria-valuemin", "0");
      expect(slider).toHaveAttribute("aria-valuemax", "100");

      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(video.currentTime).toBe(15);
    });
  });
});
