import { describe, it, expect, vi, beforeEach } from "vitest";
import ProjectsPage from "~/app/dashboard/projects/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { InfiniteProjectsList } from "~/components/dashboard/infinite-projects-list";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = `NEXT_REDIRECT;${url}`;
    throw error;
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/projects",
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

vi.mock("~/components/dashboard/infinite-projects-list", () => ({
  InfiniteProjectsList: vi.fn((props: any) => (
    <div
      data-testid="infinite-projects-list"
      data-count={props.initialData?.length}
      data-total-pages={props.initialTotalPages}
      data-search={props.search}
      data-sort={props.sort}
    />
  )),
}));

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(
      ProjectsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("calls ListUserVideosUseCase with default parameters (page 1, limit 20, desc) when searchParams are omitted", async () => {
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

    const result = await ProjectsPage({});

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      page: 1,
      limit: 20,
      search: "",
      sort: "desc",
    });

    expect(result).toBeDefined();
  });

  it("reads searchParams (search, sort) and passes them to use case", async () => {
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
      totalPages: 2,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const searchParams = Promise.resolve({
      search: "episodio",
      sort: "asc",
    });

    const result = await ProjectsPage({ searchParams });

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-456",
      page: 1,
      limit: 20,
      search: "episodio",
      sort: "asc",
    });

    expect(result).toBeDefined();
  });

  it("renders InfiniteProjectsList with correct initial props", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const sampleData = [
      {
        id: "v1",
        s3Key: "k1",
        filename: "Video 1",
        status: "completed",
        clipsCount: 1,
        createdAt: new Date(),
      },
    ];

    const mockExecute = vi.fn().mockResolvedValue({
      data: sampleData,
      totalCount: 20,
      totalPages: 2,
      currentPage: 1,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await ProjectsPage({
      searchParams: Promise.resolve({ search: "podcast", sort: "desc" }),
    });

    const children = Array.isArray(result.props.children)
      ? result.props.children
      : [result.props.children];

    const infiniteList = children.find(
      (child: any) => child && child.type === InfiniteProjectsList
    );

    expect(infiniteList).toBeDefined();
    expect(infiniteList.props).toEqual({
      initialData: sampleData,
      initialTotalPages: 2,
      search: "podcast",
      sort: "desc",
    });
  });
});
