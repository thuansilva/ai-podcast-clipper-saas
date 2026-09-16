import { describe, it, expect, vi, beforeEach } from "vitest";
import VideosPage from "~/app/dashboard/videos/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { Pagination } from "~/components/ui/pagination";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = `NEXT_REDIRECT;${url}`;
    throw error;
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/videos",
}));

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeListUserVideosUseCase: vi.fn(),
}));

vi.mock("~/components/dashboard/videos-toolbar", () => ({
  VideosToolbar: vi.fn(() => <div data-testid="videos-toolbar" />),
}));

vi.mock("~/components/dashboard/recent-videos-client", () => ({
  RecentVideosClient: vi.fn(({ uploadedFiles, hideHeader, emptyMessage }: any) => (
    <div
      data-testid="recent-videos-client"
      data-count={uploadedFiles?.length}
      data-hide-header={hideHeader ? "true" : "false"}
      data-empty-message={emptyMessage}
    >
      Videos: {uploadedFiles?.length}
    </div>
  )),
}));

describe("VideosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(VideosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("calls ListUserVideosUseCase with default parameters when searchParams are omitted", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await VideosPage({});

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      page: 1,
      search: "",
      sort: "desc",
    });

    expect(result).toBeDefined();
  });

  it("reads searchParams (page, search, sort) and passes parsed values to use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-456"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [
        {
          id: "video-1",
          s3Key: "uploads/user-456/uuid/v1.mp4",
          filename: "Episódio 10",
          status: "completed",
          clipsCount: 2,
          createdAt: new Date(),
        },
      ],
      totalCount: 25,
      totalPages: 3,
      currentPage: 2,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const searchParams = Promise.resolve({
      page: "2",
      search: "episodio",
      sort: "asc",
    });

    const result = await VideosPage({ searchParams });

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-456",
      page: 2,
      search: "episodio",
      sort: "asc",
    });

    expect(result).toBeDefined();
  });

  it("handles invalid or negative page numbers by defaulting to 1", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-456"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    await VideosPage({
      searchParams: Promise.resolve({ page: "invalid-number" }),
    });

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-456",
      page: 1,
      search: "",
      sort: "desc",
    });
  });

  it("renders Pagination when totalPages > 1", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [
        {
          id: "v1",
          s3Key: "k1",
          filename: "Video 1",
          status: "completed",
          clipsCount: 1,
          createdAt: new Date(),
        },
      ],
      totalCount: 20,
      totalPages: 2,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await VideosPage({
      searchParams: Promise.resolve({ page: "1" }),
    });

    // Verify pagination component is in the tree
    const children = Array.isArray(result.props.children)
      ? result.props.children
      : [result.props.children];

    const hasPagination = children.some(
      (child: any) => child && child.type === Pagination
    );
    expect(hasPagination).toBe(true);
  });

  it("does not render Pagination when totalPages <= 1", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [],
      totalCount: 1,
      totalPages: 1,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await VideosPage({
      searchParams: Promise.resolve({ page: "1" }),
    });

    const children = Array.isArray(result.props.children)
      ? result.props.children
      : [result.props.children];

    const hasPagination = children.some(
      (child: any) => child && child.type === Pagination
    );
    expect(hasPagination).toBe(false);
  });

  it("generates correct pagination links preserving search and sort query parameters", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [
        {
          id: "v1",
          s3Key: "k1",
          filename: "Video 1",
          status: "completed",
          clipsCount: 1,
          createdAt: new Date(),
        },
      ],
      totalCount: 30,
      totalPages: 3,
      currentPage: 2,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await VideosPage({
      searchParams: Promise.resolve({ page: "2", search: "corte", sort: "asc" }),
    });

    const children = Array.isArray(result.props.children)
      ? result.props.children
      : [result.props.children];

    const pagination = children.find((c: any) => c && c.type === Pagination);
    expect(pagination).toBeDefined();

    const content = pagination.props.children;
    expect(content).toBeDefined();

    // Check previous link has page=1 and search/sort
    const items = content.props.children;
    const prevItem = items[0];
    expect(prevItem.props.children.props.href).toBe(
      "/dashboard/videos?page=1&search=corte&sort=asc"
    );

    // Check next link has page=3 and search/sort
    const nextItem = items[items.length - 1];
    expect(nextItem.props.children.props.href).toBe(
      "/dashboard/videos?page=3&search=corte&sort=asc"
    );
  });
});
