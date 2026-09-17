import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentVideosClient } from "~/components/dashboard/recent-videos-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("RecentVideosClient", () => {
  it("renders empty state message when uploadedFiles is empty", () => {
    render(
      <RecentVideosClient
        uploadedFiles={[]}
        emptyMessage="Nenhum projeto encontrado."
      />
    );

    expect(screen.getByText("Nenhum projeto encontrado.")).toBeDefined();
  });

  it("renders project cards wrapped in link to /dashboard/projects/[id]", () => {
    const mockFiles = [
      {
        id: "proj-101",
        s3Key: "uploads/user-1/uuid/video.mp4",
        filename: "Podcast Episodio 1",
        status: "processed",
        clipsCount: 4,
        createdAt: new Date("2026-03-01"),
      },
      {
        id: "proj-102",
        s3Key: "uploads/user-1/uuid/video2.mp4",
        filename: "Podcast Episodio 2",
        status: "processing",
        clipsCount: 0,
        createdAt: new Date("2026-03-02"),
      },
    ];

    render(<RecentVideosClient uploadedFiles={mockFiles} />);

    expect(screen.getByText("Podcast Episodio 1")).toBeDefined();
    expect(screen.getByText("Podcast Episodio 2")).toBeDefined();

    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
    expect(links[0]?.getAttribute("href")).toBe("/dashboard/projects/proj-101");
    expect(links[1]?.getAttribute("href")).toBe("/dashboard/projects/proj-102");
  });

  it("applies group class to link and group-hover classes to card and play overlay", () => {
    const mockFiles = [
      {
        id: "proj-101",
        s3Key: "uploads/user-1/uuid/video.mp4",
        filename: "Podcast Episodio 1",
        status: "processed",
        clipsCount: 4,
        createdAt: new Date("2026-03-01"),
      },
    ];

    const { container } = render(
      <RecentVideosClient uploadedFiles={mockFiles} />
    );

    const link = screen.getByRole("link");
    expect(link.className).toContain("group");

    const card = container.querySelector(".group-hover\\:border-\\[var\\(--linha-2\\)\\]");
    expect(card).not.toBeNull();

    const playOverlay = container.querySelector(".group-hover\\:bg-\\[var\\(--tinta\\)\\]\\/30");
    expect(playOverlay).not.toBeNull();

    const playIconWrapper = container.querySelector(".group-hover\\:scale-105");
    expect(playIconWrapper).not.toBeNull();
  });
});
