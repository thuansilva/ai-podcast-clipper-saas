import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadMoreProjectsAction } from "~/actions/projects-actions";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeListUserVideosUseCase: vi.fn(),
}));

describe("loadMoreProjectsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized error when user is not logged in", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(loadMoreProjectsAction(1)).rejects.toThrow("Não autorizado.");
  });

  it("calls ListUserVideosUseCase with default limit 20 and desc sort", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      data: [{ id: "proj-1" }],
      totalCount: 1,
      totalPages: 1,
      currentPage: 2,
    });

    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await loadMoreProjectsAction(2, "my search");

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      page: 2,
      search: "my search",
      sort: "desc",
      limit: 20,
    });
    expect(result).toEqual({
      data: [{ id: "proj-1" }],
      totalCount: 1,
      totalPages: 1,
      currentPage: 2,
    });
  });

  it("passes sort as asc when requested", async () => {
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

    await loadMoreProjectsAction(3, "query", "asc");

    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      page: 3,
      search: "query",
      sort: "asc",
      limit: 20,
    });
  });
});
