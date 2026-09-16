import { describe, it, expect, vi, beforeEach } from "vitest";
import CreateProjectPage from "~/app/dashboard/create/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
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

describe("CreateProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(CreateProjectPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("fetches credits and processing options, then renders CreateProjectClient", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      credits: 25,
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

    const result = await CreateProjectPage();

    expect(db.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "user-123" },
      select: { credits: true },
    });
    expect(getProcessingOptions).toHaveBeenCalled();

    expect(result.props.userCredits).toBe(25);
    expect(result.props.options).toEqual(mockOptions);
  });
});
