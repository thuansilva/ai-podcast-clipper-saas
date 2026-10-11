import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteProjectAction,
  renameProjectAction,
  retryProjectAction,
} from "~/actions/projects-actions";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeDeleteProjectUseCase,
  makeRenameProjectUseCase,
  makeRetryProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { getProcessingOptions } from "~/application/services/processing-options.service";

// Deliberately NOT mocking ~/infrastructure/factories/rate-limiter-factory
// here: this file exercises the real in-memory limiter to prove
// deleteProjectAction/renameProjectAction/retryProjectAction actually
// enforce the limit (item HIGH do checklist go-live: "Rate limit ausente em
// actions de projeto e billing").

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeDeleteProjectUseCase: vi.fn(),
  makeRenameProjectUseCase: vi.fn(),
  makeRetryProjectUseCase: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("~/application/services/processing-options.service", () => ({
  getProcessingOptions: vi.fn().mockResolvedValue({}),
}));

function uniqueUserId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

describe("projects-actions Server Actions - rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProcessingOptions).mockResolvedValue({} as any);
  });

  it("deleteProjectAction: permite até 20 exclusões por minuto e bloqueia a 21a sem chamar o use case", async () => {
    const userId = uniqueUserId("user-delete-rl");
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(userId),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeDeleteProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    for (let i = 0; i < 20; i++) {
      const result = await deleteProjectAction(`proj-${i}`);
      expect(result.success).toBe(true);
    }

    const blocked = await deleteProjectAction("proj-21");

    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("Too many requests");
    expect(mockExecute).toHaveBeenCalledTimes(20);
  });

  it("renameProjectAction: permite até 20 renomeações por minuto e bloqueia a 21a sem chamar o use case", async () => {
    const userId = uniqueUserId("user-rename-rl");
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(userId),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeRenameProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    for (let i = 0; i < 20; i++) {
      const result = await renameProjectAction("proj-1", `Nome ${i}`);
      expect(result.success).toBe(true);
    }

    const blocked = await renameProjectAction("proj-1", "Nome 21");

    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("Too many requests");
    expect(mockExecute).toHaveBeenCalledTimes(20);
  });

  it("retryProjectAction: permite até 20 retries por minuto e bloqueia o 21o sem chamar o use case", async () => {
    const userId = uniqueUserId("user-retry-rl");
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(userId),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    for (let i = 0; i < 20; i++) {
      const result = await retryProjectAction("proj-1");
      expect(result.success).toBe(true);
    }

    const blocked = await retryProjectAction("proj-1");

    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("Too many requests");
    expect(mockExecute).toHaveBeenCalledTimes(20);
  });

  it("não compartilha o limite entre usuários diferentes (deleteProjectAction)", async () => {
    const userId = uniqueUserId("user-delete-rl-isolated");
    const getUserId = vi.fn().mockResolvedValue(userId);
    vi.mocked(makeAuthGateway).mockReturnValue({ getUserId } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeDeleteProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    for (let i = 0; i < 20; i++) {
      await deleteProjectAction(`proj-${i}`);
    }

    getUserId.mockResolvedValue(uniqueUserId("another-user-delete-rl"));
    const result = await deleteProjectAction("proj-from-other-user");

    expect(result.success).toBe(true);
  });
});
