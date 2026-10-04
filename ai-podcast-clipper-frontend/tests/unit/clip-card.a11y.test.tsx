import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipCard } from "~/components/clip-card";
import type { Clip } from "@prisma/client";

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({
    success: true,
    url: "https://example.com/clip.mp4",
  }),
  deleteClip: vi.fn(),
  updateClip: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockClip: Clip = {
  id: "clip-1",
  s3Key: "test.mp4",
  title: "Test Clip",
  hook: "Test hook",
  viralityScore: 8.5,
  reason: "Test reason",
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
};

describe("ClipCard - Accessibility (WCAG 2.1 AA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WCAG 4.1.2: Action buttons have accessible names", () => {
    it("info button should have aria-label (BLOCKER #5)", () => {
      render(<ClipCard clip={mockClip} />);
      const buttons = screen.getAllByRole("button");

      // Find the info button - should have aria-label or accessible name
      const infoButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        return (ariaLabel?.toLowerCase().includes("info") ||
                ariaLabel?.toLowerCase().includes("detalh") ||
                title?.toLowerCase().includes("detalh"));
      });

      expect(infoButton).toBeDefined();
      expect(infoButton?.getAttribute("aria-label")).toBeTruthy();
    });

    it("calendar button should have aria-label (BLOCKER #5)", () => {
      render(<ClipCard clip={mockClip} />);
      const buttons = screen.getAllByRole("button");

      const calendarButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        return (ariaLabel?.toLowerCase().includes("calendar") ||
                ariaLabel?.toLowerCase().includes("agendar") ||
                title?.toLowerCase().includes("agendar"));
      });

      expect(calendarButton).toBeDefined();
      if (calendarButton) {
        expect(calendarButton.getAttribute("aria-label")).toBeTruthy();
      }
    });

    it("download button should have aria-label (BLOCKER #5)", () => {
      render(<ClipCard clip={mockClip} />);
      const buttons = screen.getAllByRole("button");

      const downloadButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        return (ariaLabel?.toLowerCase().includes("download") ||
                title?.toLowerCase().includes("download"));
      });

      expect(downloadButton).toBeDefined();
      expect(downloadButton?.getAttribute("aria-label")).toBeTruthy();
    });

    it("edit button should have aria-label (BLOCKER #5)", () => {
      render(<ClipCard clip={mockClip} />);
      const buttons = screen.getAllByRole("button");

      const editButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        return (ariaLabel?.toLowerCase().includes("edit") ||
                ariaLabel?.toLowerCase().includes("editar") ||
                title?.toLowerCase().includes("editar"));
      });

      expect(editButton).toBeDefined();
      expect(editButton?.getAttribute("aria-label")).toBeTruthy();
    });

    it("delete button should have aria-label (BLOCKER #5)", () => {
      render(<ClipCard clip={mockClip} />);
      const buttons = screen.getAllByRole("button");

      const deleteButton = buttons.find(btn => {
        const ariaLabel = btn.getAttribute("aria-label");
        const title = btn.getAttribute("title");
        return (ariaLabel?.toLowerCase().includes("delete") ||
                ariaLabel?.toLowerCase().includes("excluir") ||
                title?.toLowerCase().includes("excluir"));
      });

      expect(deleteButton).toBeDefined();
      expect(deleteButton?.getAttribute("aria-label")).toBeTruthy();
    });
  });
});
