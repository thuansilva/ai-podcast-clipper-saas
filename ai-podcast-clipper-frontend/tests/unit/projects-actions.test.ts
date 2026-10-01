import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadMoreProjectsAction,
  deleteProjectAction,
  renameProjectAction,
  retryProjectAction,
} from "~/actions/projects-actions";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeListUserVideosUseCase,
  makeDeleteProjectUseCase,
  makeRenameProjectUseCase,
  makeRetryProjectUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { getProcessingOptions } from "~/application/services/processing-options.service";

vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeListUserVideosUseCase: vi.fn(),
  makeDeleteProjectUseCase: vi.fn(),
  makeRenameProjectUseCase: vi.fn(),
  makeRetryProjectUseCase: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("~/application/services/processing-options.service", () => ({
  getProcessingOptions: vi.fn().mockResolvedValue({
    CLIP_MODEL: [
      { value: "auto", label: "Padrão (Auto)" },
      { value: "face_focus", label: "Foco no Rosto" },
    ],
    ASPECT_RATIO: [
      { value: "9:16", label: "9:16" },
      { value: "1:1", label: "1:1" },
      { value: "16:9", label: "16:9" },
      { value: "4:5", label: "4:5" },
    ],
  }),
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

  it("rejeita page inválida (zero/negativa) sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    await expect(loadMoreProjectsAction(0)).rejects.toThrow();
    await expect(loadMoreProjectsAction(-1)).rejects.toThrow();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita sort fora do enum conhecido (ex: payload malicioso) sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    await expect(
      loadMoreProjectsAction(1, undefined, "'; DROP TABLE projects; --")
    ).rejects.toThrow();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita search acima de 200 caracteres sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeListUserVideosUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    await expect(loadMoreProjectsAction(1, "a".repeat(201))).rejects.toThrow();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("renameProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna erro de não autorizado quando usuário não está logado", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    const result = await renameProjectAction("proj-1", "Novo nome");
    expect(result).toEqual({ success: false, error: "Não autorizado." });
  });

  it("rejeita newName vazio sem chamar o use case (proteção real de servidor, não só do client)", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRenameProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await renameProjectAction("proj-1", "   ");

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita newName acima de 200 caracteres sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRenameProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await renameProjectAction("proj-1", "a".repeat(201));

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("renomeia com sucesso quando o nome é válido", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeRenameProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await renameProjectAction("proj-1", "Meu projeto renomeado");

    expect(result).toEqual({ success: true });
    expect(mockExecute).toHaveBeenCalledWith({
      userId: "user-123",
      projectId: "proj-1",
      newName: "Meu projeto renomeado",
    });
  });
});

describe("deleteProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna erro de não autorizado quando usuário não está logado", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    const result = await deleteProjectAction("proj-1");
    expect(result).toEqual({ success: false, error: "Não autorizado." });
  });

  it("rejeita id vazio sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeDeleteProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await deleteProjectAction("");

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("exclui com sucesso quando o id é válido", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeDeleteProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await deleteProjectAction("proj-1");

    expect(result).toEqual({ success: true });
    expect(mockExecute).toHaveBeenCalledWith({ userId: "user-123", projectId: "proj-1" });
  });
});

describe("retryProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProcessingOptions).mockResolvedValue({
      CLIP_MODEL: [
        { value: "auto", label: "Padrão (Auto)" },
        { value: "face_focus", label: "Foco no Rosto" },
      ],
      ASPECT_RATIO: [
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
        { value: "16:9", label: "16:9" },
        { value: "4:5", label: "4:5" },
      ],
    } as any);
  });

  it("retorna erro de não autorizado quando usuário não está logado", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    const result = await retryProjectAction("proj-1");
    expect(result).toEqual({ success: false, error: "Não autorizado." });
  });

  it("rejeita subtitlePreset fora da lista conhecida sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1", {
      subtitlePreset: "<script>alert(1)</script>",
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita sliceStartTime/sliceEndTime negativos sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1", {
      sliceStartTime: -5,
      sliceEndTime: 300,
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita clipModel que não existe nas ProcessingOptions vigentes sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1", {
      clipModel: "modelo_inexistente",
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejeita aspectRatio que não existe nas ProcessingOptions vigentes sem chamar o use case", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn();
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1", {
      aspectRatio: "21:9",
    });

    expect(result.success).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("reenvia com sucesso quando updates são válidos", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1", {
      subtitlePreset: "GAMER",
      clipModel: "face_focus",
      aspectRatio: "1:1",
      autoZoom: true,
      sliceStartTime: 0,
      sliceEndTime: 300,
    });

    expect(result).toEqual({ success: true });
    expect(mockExecute).toHaveBeenCalledWith({
      projectId: "proj-1",
      userId: "user-123",
      updates: {
        subtitlePreset: "GAMER",
        clipModel: "face_focus",
        aspectRatio: "1:1",
        autoZoom: true,
        sliceStartTime: 0,
        sliceEndTime: 300,
      },
    });
  });

  it("reenvia com sucesso sem updates", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-123"),
    } as any);

    const mockExecute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeRetryProjectUseCase).mockReturnValue({
      execute: mockExecute,
    } as any);

    const result = await retryProjectAction("proj-1");

    expect(result).toEqual({ success: true });
    expect(mockExecute).toHaveBeenCalledWith({
      projectId: "proj-1",
      userId: "user-123",
      updates: undefined,
    });
  });
});
