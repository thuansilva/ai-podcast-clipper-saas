import { describe, it, expect, vi, beforeEach } from "vitest";
import DashboardPage from "~/app/dashboard/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { getProcessingOptions } from "~/application/services/processing-options.service";
import { db } from "~/server/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = `NEXT_REDIRECT;${url}`;
    throw error;
  }),
}));

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeListUserVideosUseCase: vi.fn(),
}));

vi.mock("~/application/services/processing-options.service", () => ({
  getProcessingOptions: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("~/components/dashboard/create-project-client", () => ({
  CreateProjectClient: vi.fn(({ userCredits, options }: any) => (
    <div data-testid="create-project-client" data-credits={userCredits}>
      Options count: {Object.keys(options || {}).length}
    </div>
  )),
}));

vi.mock("~/components/dashboard/recent-videos-client", () => ({
  RecentVideosClient: vi.fn(({ uploadedFiles }: any) => (
    <div data-testid="recent-videos-client" data-count={uploadedFiles?.length}>
      Videos count: {uploadedFiles?.length}
    </div>
  )),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("fetches credits, processing options, and recent videos, then renders stacked layout", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      credits: 40,
    } as any);

    const mockOptions = {
      GENRE: [
        {
          id: "1",
          type: "GENRE",
          value: "podcast",
          label: "Podcast",
          order: 1,
          isActive: true,
          isDefault: true,
        },
      ],
    };
    vi.mocked(getProcessingOptions).mockResolvedValue(mockOptions as any);

    const mockVideos = {
      data: [
        {
          id: "video-1",
          s3Key: "user-123/video-1.mp4",
          filename: "Episode 1",
          status: "completed",
          clipsCount: 3,
          createdAt: new Date(),
        },
      ],
      totalCount: 1,
      totalPages: 1,
      currentPage: 1,
    };

    const mockExecute = vi.fn().mockResolvedValue(mockVideos);
    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await DashboardPage();

    expect(db.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "user-123" },
      select: { credits: true },
    });
    expect(getProcessingOptions).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      limit: 10,
    });

    // Verify rendered output
    expect(result).toBeDefined();
    expect(result.props.className).toContain("space-y-8");
  });
});
