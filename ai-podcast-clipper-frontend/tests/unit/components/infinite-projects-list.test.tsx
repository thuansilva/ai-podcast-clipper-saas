import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { InfiniteProjectsList } from "~/components/dashboard/infinite-projects-list";
import { loadMoreProjectsAction } from "~/actions/projects-actions";
import { useInView } from "react-intersection-observer";
import type { UploadedFileDTO } from "~/application/dtos/video-dtos";

vi.mock("react-intersection-observer", () => ({
  useInView: vi.fn(),
}));

vi.mock("~/actions/projects-actions", () => ({
  loadMoreProjectsAction: vi.fn(),
}));

vi.mock("~/components/dashboard/recent-videos-client", () => ({
  RecentVideosClient: vi.fn(({ uploadedFiles, emptyMessage }: any) => (
    <div data-testid="recent-videos-mock" data-empty={emptyMessage}>
      {uploadedFiles?.map((f: any) => (
        <span key={f.id} data-testid="project-item">
          {f.filename}
        </span>
      ))}
    </div>
  )),
}));

const mockInitialData: UploadedFileDTO[] = [
  {
    id: "p1",
    s3Key: "key-1",
    filename: "Projeto 1",
    status: "completed",
    clipsCount: 3,
    createdAt: new Date("2026-01-01"),
  },
];

describe("InfiniteProjectsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useInView).mockReturnValue({
      ref: vi.fn(),
      inView: false,
      entry: undefined,
    } as any);
  });

  it("renders initial projects and no spinner when initialTotalPages <= 1", () => {
    render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={1}
      />
    );

    expect(screen.getByText("Projeto 1")).toBeDefined();
    expect(screen.queryByTestId("infinite-scroll-trigger")).toBeNull();
  });

  it("renders spinner when initialTotalPages > 1", () => {
    render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={3}
      />
    );

    expect(screen.getByTestId("infinite-scroll-trigger")).toBeDefined();
  });

  it("loads more projects when inView is true and hasMore is true", async () => {
    vi.mocked(useInView).mockReturnValue({
      ref: vi.fn(),
      inView: true,
      entry: undefined,
    } as any);

    const page2Data: UploadedFileDTO[] = [
      {
        id: "p2",
        s3Key: "key-2",
        filename: "Projeto 2",
        status: "completed",
        clipsCount: 1,
        createdAt: new Date("2026-01-02"),
      },
    ];

    vi.mocked(loadMoreProjectsAction).mockResolvedValue({
      data: page2Data,
      totalCount: 2,
      totalPages: 2,
      currentPage: 2,
    });

    render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={2}
        search="meu video"
        sort="asc"
      />
    );

    await waitFor(() => {
      expect(loadMoreProjectsAction).toHaveBeenCalledWith(2, "meu video", "asc");
    });

    await waitFor(() => {
      expect(screen.getByText("Projeto 2")).toBeDefined();
    });

    // Since currentPage (2) === totalPages (2), hasMore becomes false and spinner is removed
    await waitFor(() => {
      expect(screen.queryByTestId("infinite-scroll-trigger")).toBeNull();
    });
  });

  it("resets state when filters or initialData change", () => {
    const { rerender } = render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={1}
        search="busca1"
      />
    );

    expect(screen.getByText("Projeto 1")).toBeDefined();
    expect(screen.queryByTestId("infinite-scroll-trigger")).toBeNull();

    const newData: UploadedFileDTO[] = [
      {
        id: "p99",
        s3Key: "key-99",
        filename: "Projeto 99",
        status: "completed",
        clipsCount: 0,
        createdAt: new Date("2026-01-03"),
      },
    ];

    rerender(
      <InfiniteProjectsList
        initialData={newData}
        initialTotalPages={3}
        search="busca2"
      />
    );

    expect(screen.getByText("Projeto 99")).toBeDefined();
    expect(screen.getByTestId("infinite-scroll-trigger")).toBeDefined();
  });

  it("handles fetch failure gracefully, halts scrolling, and shows retry button", async () => {
    vi.mocked(useInView).mockReturnValue({
      ref: vi.fn(),
      inView: true,
      entry: undefined,
    } as any);

    vi.mocked(loadMoreProjectsAction).mockRejectedValueOnce(
      new Error("Network Error")
    );

    render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("load-more-error")).toBeDefined();
      expect(screen.getByText("Erro ao carregar mais projetos.")).toBeDefined();
    });

    // Verify trigger spinner is removed so it does not loop
    expect(screen.queryByTestId("infinite-scroll-trigger")).toBeNull();
    expect(loadMoreProjectsAction).toHaveBeenCalledTimes(1);

    // Mock successful retry
    vi.mocked(loadMoreProjectsAction).mockResolvedValueOnce({
      data: [
        {
          id: "p2",
          s3Key: "key-2",
          filename: "Projeto 2",
          status: "completed",
          clipsCount: 1,
          createdAt: new Date("2026-01-02"),
        },
      ],
      totalCount: 2,
      totalPages: 2,
      currentPage: 2,
    });

    const retryButton = screen.getByTestId("retry-load-more");
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("Projeto 2")).toBeDefined();
    });
    expect(screen.queryByTestId("load-more-error")).toBeNull();
  });

  it("cancels in-flight requests when filters change to avoid race condition", async () => {
    vi.mocked(useInView).mockReturnValue({
      ref: vi.fn(),
      inView: true,
      entry: undefined,
    } as any);

    let resolveInFlight!: (val: any) => void;
    const inFlightPromise = new Promise((resolve) => {
      resolveInFlight = resolve;
    });

    vi.mocked(loadMoreProjectsAction).mockReturnValueOnce(
      inFlightPromise as any
    );

    const { rerender } = render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={2}
        search="termo-antigo"
      />
    );

    // Change search while request is in-flight
    const newInitialData: UploadedFileDTO[] = [
      {
        id: "p-novo-1",
        s3Key: "k-novo-1",
        filename: "Projeto Novo",
        status: "completed",
        clipsCount: 1,
        createdAt: new Date(),
      },
    ];

    rerender(
      <InfiniteProjectsList
        initialData={newInitialData}
        initialTotalPages={1}
        search="termo-novo"
      />
    );

    // Now resolve the old request
    resolveInFlight({
      data: [
        {
          id: "p-velho-2",
          s3Key: "k-velho-2",
          filename: "Projeto Velho 2",
          status: "completed",
          clipsCount: 1,
          createdAt: new Date(),
        },
      ],
      totalCount: 2,
      totalPages: 2,
      currentPage: 2,
    });

    await waitFor(() => {
      expect(screen.getByText("Projeto Novo")).toBeDefined();
    });

    // Ensure the old item was NOT appended
    expect(screen.queryByText("Projeto Velho 2")).toBeNull();
  });

  it("deduplicates incoming items by id when appending", async () => {
    vi.mocked(useInView).mockReturnValue({
      ref: vi.fn(),
      inView: true,
      entry: undefined,
    } as any);

    // Return an item that already exists in initialData (p1) along with a new item (p2)
    vi.mocked(loadMoreProjectsAction).mockResolvedValueOnce({
      data: [
        {
          id: "p1", // duplicate
          s3Key: "key-1",
          filename: "Projeto 1",
          status: "completed",
          clipsCount: 3,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "p2", // new
          s3Key: "key-2",
          filename: "Projeto 2",
          status: "completed",
          clipsCount: 1,
          createdAt: new Date("2026-01-02"),
        },
      ],
      totalCount: 2,
      totalPages: 2,
      currentPage: 2,
    });

    render(
      <InfiniteProjectsList
        initialData={mockInitialData}
        initialTotalPages={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Projeto 2")).toBeDefined();
    });

    const items = screen.getAllByTestId("project-item");
    expect(items.length).toBe(2); // Only p1 and p2, not p1 duplicate
  });
});
