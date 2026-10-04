import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CustomVideoPlayer } from "~/components/custom-video-player";

describe("CustomVideoPlayer - Accessibility (WCAG 2.1 AA)", () => {
  const mockVideoSrc = "https://example.com/video.mp4";

  describe("WCAG 4.1.2: Mute button accessible name", () => {
    it("should have aria-label on mute button (BLOCKER #1)", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      const buttons = screen.getAllByRole("button");
      const muteButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        return ariaLabel && (ariaLabel.toLowerCase().includes("mute") || ariaLabel.toLowerCase().includes("mudo") || ariaLabel.toLowerCase().includes("volume"));
      });

      expect(muteButton).toBeDefined();
      expect(muteButton?.getAttribute("aria-label")).toBeTruthy();
    });
  });

  describe("WCAG 2.1.1: Keyboard accessible controls", () => {
    it("mute button should not rely solely on hover for visibility (BLOCKER #2)", () => {
      render(<CustomVideoPlayer src={mockVideoSrc} />);
      const buttons = screen.getAllByRole("button");
      const muteButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        return ariaLabel && ariaLabel.toLowerCase().includes("mute");
      });

      expect(muteButton).toBeDefined();
      if (muteButton) {
        const classList = muteButton.className;
        // If button has opacity-0 and group-hover:opacity-100, it's inaccessible via keyboard
        const hasHiddenOpacity = classList.includes("opacity-0");
        const hasGroupHover = classList.includes("group-hover");

        if (hasHiddenOpacity && hasGroupHover) {
          // Should have focus-visible or focus indicator for keyboard access
          expect(classList).toMatch(/focus-visible:opacity|focus:opacity|focus-visible:ring|focus:ring/);
        }
      }
    });
  });
});
