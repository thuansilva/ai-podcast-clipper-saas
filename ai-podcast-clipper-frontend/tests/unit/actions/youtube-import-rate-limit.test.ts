import { describe, it, expect, vi, beforeEach } from "vitest";
import { importYouTubeVideo } from "~/actions/youtube";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";

// Deliberately NOT mocking ~/infrastructure/factories/rate-limiter-factory
// here: this file exercises the real in-memory limiter to prove the action
// actually enforces the limit (item 4 of the security roadmap).

const mockAuthGateway = {
  getUserId: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUserId: vi.fn(),
};

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => mockAuthGateway,
}));

vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((cb: any) => cb),
}));

vi.mock("~/application/services/processing-options.service", () => ({
  getProcessingOptions: vi.fn().mockResolvedValue({}),
}));

describe("importYouTubeVideo Server Action - rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGateway.getUserId.mockResolvedValue("user-rate-limited");
    vi.mocked(db.uploadedFile.create).mockResolvedValue({
      id: "uploaded-file-id",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    } as any);
    vi.mocked(inngest.send).mockResolvedValue({} as any);
  });

  it("permite até 5 importações por minuto e bloqueia a 6a com RateLimitExceededError", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await importYouTubeVideo({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
      expect(result.success).toBe(true);
    }

    const sixth = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(sixth.success).toBe(false);
    expect(sixth.error).toContain("Too many requests");
    // Confirms the 6th call was rejected before hitting the DB/queue.
    expect(db.uploadedFile.create).toHaveBeenCalledTimes(5);
    expect(inngest.send).toHaveBeenCalledTimes(5);
  });

  it("não compartilha o limite entre usuários diferentes", async () => {
    for (let i = 0; i < 5; i++) {
      await importYouTubeVideo({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
    }

    mockAuthGateway.getUserId.mockResolvedValue("another-user");
    const result = await importYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(result.success).toBe(true);
  });
});
