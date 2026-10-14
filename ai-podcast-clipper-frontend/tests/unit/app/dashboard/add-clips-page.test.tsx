import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import AddClipsToProjectPage from "~/app/dashboard/projects/[id]/add-clips/page";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
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

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      findUnique: vi.fn(),
    },
    projectProcessingBatch: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/components/dashboard/add-clips-to-project-client", () => ({
  AddClipsToProjectClient: (props: Record<string, unknown>) => (
    <div data-testid="add-clips-client">{JSON.stringify(props)}</div>
  ),
}));

const youtubeProject = {
  id: "proj-1",
  displayName: "Meu Podcast",
  sourceType: "YOUTUBE",
  youtubeUrl: "https://www.youtube.com/watch?v=abc12345678",
  durationSeconds: 3600,
  clips: [] as Array<{ sourceStartTime: number | null; sourceEndTime: number | null }>,
};

describe("AddClipsToProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue(null);
    vi.mocked(db.user.findUnique).mockResolvedValue({ credits: 100 } as any);
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(
      AddClipsToProjectPage({ params: Promise.resolve({ id: "proj-1" }) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard/projects if project does not exist or does not belong to user", async () => {
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue(null);

    await expect(
      AddClipsToProjectPage({ params: Promise.resolve({ id: "proj-404" }) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/projects");
  });

  it("blocks with UnsupportedAppendSourceError when the project is not from YouTube", async () => {
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      ...youtubeProject,
      sourceType: "UPLOAD",
      youtubeUrl: null,
    } as any);

    const result = await AddClipsToProjectPage({
      params: Promise.resolve({ id: "proj-1" }),
    });
    render(result);

    expect(
      screen.getByText(/só é possível adicionar mais cortes a projetos importados do youtube/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("add-clips-client")).not.toBeInTheDocument();
  });

  it("blocks with LegacyClipsMissingSourceRangeError when a clip has no sourceStartTime/sourceEndTime", async () => {
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      ...youtubeProject,
      clips: [{ sourceStartTime: null, sourceEndTime: null }],
    } as any);

    const result = await AddClipsToProjectPage({
      params: Promise.resolve({ id: "proj-1" }),
    });
    render(result);

    expect(
      screen.getByText(/clipes antigos sem o tempo original registrado/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("add-clips-client")).not.toBeInTheDocument();
  });

  it("blocks with ProjectBatchInProgressError when there is an active batch", async () => {
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      ...youtubeProject,
    } as any);
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue({
      id: "batch-1",
      status: "processing",
    } as any);

    const result = await AddClipsToProjectPage({
      params: Promise.resolve({ id: "proj-1" }),
    });
    render(result);

    expect(
      screen.getByText(/já tem um processamento em andamento/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("add-clips-client")).not.toBeInTheDocument();
  });

  it("renders AddClipsToProjectClient with the used ranges and credits when nothing blocks the append", async () => {
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      ...youtubeProject,
      clips: [{ sourceStartTime: 10, sourceEndTime: 40 }],
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({ credits: 42 } as any);

    const result = await AddClipsToProjectPage({
      params: Promise.resolve({ id: "proj-1" }),
    });
    render(result);

    const client = screen.getByTestId("add-clips-client");
    const props = JSON.parse(client.textContent || "{}");
    expect(props.projectId).toBe("proj-1");
    expect(props.youtubeUrl).toBe(youtubeProject.youtubeUrl);
    expect(props.usedRanges).toEqual([{ start: 10, end: 40 }]);
    expect(props.userCredits).toBe(42);
  });
});
