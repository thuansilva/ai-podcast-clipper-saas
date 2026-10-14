import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { redirect } from "next/navigation";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
    clip: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    projectProcessingBatch: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe("ProjectDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default realista: projeto sem clipes ainda -> Prisma retorna _sum null.
    // Testes que precisam de um total diferente sobrescrevem explicitamente.
    vi.mocked(db.clip.aggregate).mockResolvedValue({
      _sum: { durationSeconds: null },
    } as any);
  });

  it("redirects to /login if user is not authenticated", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue(null),
    } as any);

    await expect(
      ProjectDetailsPage({ params: Promise.resolve({ id: "proj-123" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard/projects if project does not exist or does not belong to user", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue(null);

    await expect(
      ProjectDetailsPage({ params: Promise.resolve({ id: "proj-nonexistent" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(db.uploadedFile.findUnique).toHaveBeenCalledWith({
      where: { id: "proj-nonexistent", userId: "user-1" },
      include: expect.any(Object),
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard/projects");
  });

  it("renders project details and empty message when clips list is empty", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-1",
      userId: "user-1",
      displayName: "Meu Podcast Top",
      durationSeconds: 360,
      status: "processing",
      _count: { clips: 0 }, clips: [],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-1" }), searchParams: Promise.resolve({}),
    });

    expect(result).toBeDefined();
    expect(db.uploadedFile.findUnique).toHaveBeenCalledWith({
      where: { id: "proj-1", userId: "user-1" },
      include: expect.any(Object),
    });
  });

  it("renders contextual failure message when project status is failed", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-failed",
      userId: "user-1",
      displayName: "Projeto com Erro",
      durationSeconds: 120,
      status: "failed",
      errorMessage: "Erro ao processar áudio",
      _count: { clips: 0 }, clips: [],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-failed" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(
      screen.getByText("Falha ao processar o projeto. Erro ao processar áudio")
    ).toBeDefined();
  });

  it("renders project details and clips list with rounded virality score", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-2",
      userId: "user-1",
      displayName: "Entrevista Exclusiva",
      durationSeconds: 1200,
      status: "processed",
      _count: { clips: 1 },
      clips: [
        {
          id: "clip-1",
          title: "Momento Incrível",
          viralityScore: 9.24,
        },
        {
          id: "clip-2",
          title: "Momento 2",
          viralityScore: null,
          hook: "gancho sem nota",
        },
        {
          id: "clip-3",
          title: "Momento 3",
          viralityScore: 8.47,
        },
      ],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-2" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(await screen.findByText("92%")).toBeDefined();
    expect(await screen.findByText("--")).toBeDefined();
    expect(await screen.findByText("85%")).toBeDefined();
  });

  it("rotula como 'Corte Manual' os clipes de projeto com manualCutsJson, sem porcentagem", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-3",
      userId: "user-1",
      displayName: "Podcast Manual",
      durationSeconds: 600,
      status: "processed",
      manualCutsJson: JSON.stringify([{ title: "c", startTime: 0, endTime: 10 }]),
      _count: { clips: 1 },
      clips: [
        { id: "clip-m", title: "Corte A", viralityScore: null, hook: null, reason: null },
      ],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-3" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(await screen.findByText("Corte Manual")).toBeDefined();
    expect(screen.queryByText("--")).toBeNull();
  });

  it("exibe a duração total dos CORTES (aggregate de todos os clipes), não a duração do vídeo original", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-4",
      userId: "user-1",
      displayName: "Podcast Longo",
      durationSeconds: 7200, // vídeo original de 120 min
      status: "processed",
      _count: { clips: 15 },
      clips: [{ id: "clip-x", title: "Corte X", viralityScore: 9 }],
    } as any);

    // Soma de TODOS os clipes do projeto (não só os da página atual).
    vi.mocked(db.clip.aggregate).mockResolvedValue({
      _sum: { durationSeconds: 1200 }, // 20 min
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-4" }), searchParams: Promise.resolve({}),
    });

    render(result);
    expect(await screen.findByText("20 min de cortes gerados")).toBeDefined();
    expect(screen.queryByText("120 min de cortes gerados")).toBeNull();
    expect(db.clip.aggregate).toHaveBeenCalledWith({
      where: { uploadedFileId: "proj-4" },
      _sum: { durationSeconds: true },
    });
  });

  it("sempre renderiza o slot do botão 'Adicionar cortes' no header", async () => {
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);

    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
      id: "proj-5",
      userId: "user-1",
      displayName: "Podcast Qualquer",
      durationSeconds: 300,
      status: "processed",
      _count: { clips: 0 }, clips: [],
    } as any);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-5" }), searchParams: Promise.resolve({}),
    });

    render(result);
    const slot = screen.getByTestId("add-clips-slot");
    expect(slot).toBeDefined();
    expect(slot.getAttribute("href")).toBe("/dashboard/projects/proj-5/add-clips");
    expect(slot.textContent).toMatch(/Adicionar cortes/i);
  });

  describe("vídeo original (ícone + popover)", () => {
    async function renderWith(extra: Record<string, unknown>, id = "proj-x") {
      vi.mocked(makeAuthGateway).mockReturnValue({
        getUserId: vi.fn().mockResolvedValue("user-1"),
      } as any);
      vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
        id,
        userId: "user-1",
        displayName: "Podcast do YouTube",
        durationSeconds: 300,
        status: "processed",
        _count: { clips: 0 },
        clips: [],
        ...extra,
      } as any);
      render(
        await ProjectDetailsPage({
          params: Promise.resolve({ id }),
          searchParams: Promise.resolve({}),
        }),
      );
    }

    it("não renderiza o trigger quando não há youtubeUrl nem thumbnailUrl (upload direto)", async () => {
      await renderWith({ youtubeUrl: null, thumbnailUrl: null });
      expect(screen.queryByTestId("original-video-trigger")).toBeNull();
      expect(screen.queryByTestId("original-video-card")).toBeNull();
    });

    it("renderiza o trigger, mas mantém o card escondido até o clique", async () => {
      await renderWith({
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      });
      expect(screen.getByTestId("original-video-trigger")).toBeDefined();
      expect(screen.queryByTestId("original-video-card")).toBeNull();
      expect(screen.queryByTestId("original-video-youtube-link")).toBeNull();
    });

    it("ao clicar, mostra link de texto 'Assistir no YouTube' com href canônico e sem URL crua", async () => {
      await renderWith({
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      });
      fireEvent.click(screen.getByTestId("original-video-trigger"));

      expect(screen.getByTestId("original-video-card")).toBeDefined();
      const link = screen.getByTestId("original-video-youtube-link");
      expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.textContent).toContain("Assistir no YouTube");
      expect(link.textContent).not.toMatch(/youtube\.com|youtu\.be/i);
      expect(screen.getByText("5 min de duração")).toBeDefined();
    });

    it("não renderiza o link quando youtubeUrl não é do YouTube (javascript:)", async () => {
      await renderWith({
        youtubeUrl: "javascript:alert(1)//youtube.com",
        thumbnailUrl: "https://img.youtube.com/vi/xxx/hqdefault.jpg",
      });
      fireEvent.click(screen.getByTestId("original-video-trigger"));
      expect(screen.getByTestId("original-video-card")).toBeDefined();
      expect(screen.queryByTestId("original-video-youtube-link")).toBeNull();
    });

    it("não renderiza o link quando youtubeUrl é null mas thumbnailUrl existe", async () => {
      await renderWith({
        youtubeUrl: null,
        thumbnailUrl: "https://example-bucket.s3.amazonaws.com/thumb.jpg",
      });
      fireEvent.click(screen.getByTestId("original-video-trigger"));
      expect(screen.getByTestId("original-video-card")).toBeDefined();
      expect(screen.queryByTestId("original-video-youtube-link")).toBeNull();
    });
  });

  describe("busca de cortes (?q=)", () => {
    function setup(opts: { total: number; filtered: number; clips: any[] }) {
      vi.mocked(makeAuthGateway).mockReturnValue({
        getUserId: vi.fn().mockResolvedValue("user-1"),
      } as any);
      vi.mocked(db.clip.count).mockResolvedValue(opts.filtered);
      vi.mocked(db.uploadedFile.findUnique).mockResolvedValue({
        id: "proj-s",
        userId: "user-1",
        displayName: "Podcast",
        durationSeconds: 300,
        status: "processed",
        _count: { clips: opts.total },
        clips: opts.clips,
      } as any);
    }
    const run = async (sp: Record<string, string>) =>
      ProjectDetailsPage({
        params: Promise.resolve({ id: "proj-s" }),
        searchParams: Promise.resolve(sp),
      });

    it("renderiza o campo de busca (GET, aria-label) preenchido com o termo atual", async () => {
      setup({ total: 3, filtered: 1, clips: [{ id: "c1", title: "Café", viralityScore: 5 }] });
      render(await run({ q: "café" }));
      const input = screen.getByTestId("clips-search") as HTMLInputElement;
      expect(input.getAttribute("aria-label")).toBe("Buscar cortes");
      expect(input.getAttribute("name")).toBe("q");
      expect(input.defaultValue).toBe("café");
      expect(input.closest("form")?.getAttribute("method")?.toLowerCase()).toBe("get");
    });

    it("filtra no banco por title/hook (contains, insensitive) e mantém aggregate sobre todos os cortes", async () => {
      setup({ total: 3, filtered: 1, clips: [{ id: "c1", title: "Café", viralityScore: 5 }] });
      render(await run({ q: "  café " }));

      const args = vi.mocked(db.uploadedFile.findUnique).mock.calls[0]![0] as any;
      expect(args.include.clips.where).toEqual({
        OR: [
          { title: { contains: "café", mode: "insensitive" } },
          { hook: { contains: "café", mode: "insensitive" } },
        ],
      });
      expect(db.clip.aggregate).toHaveBeenCalledWith({
        where: { uploadedFileId: "proj-s" },
        _sum: { durationSeconds: true },
      });
      expect(screen.getByText("3 cortes gerados")).toBeDefined();
    });

    it("sem q não aplica filtro e não faz count extra", async () => {
      setup({ total: 1, filtered: 1, clips: [{ id: "c1", title: "A", viralityScore: 5 }] });
      render(await run({}));
      const args = vi.mocked(db.uploadedFile.findUnique).mock.calls[0]![0] as any;
      expect(args.include.clips.where).toBeUndefined();
      expect(db.clip.count).not.toHaveBeenCalled();
    });

    it("mostra estado vazio específico quando a busca não encontra nada", async () => {
      setup({ total: 3, filtered: 0, clips: [] });
      render(await run({ q: "xyz" }));
      expect(screen.getByText(/Nenhum corte encontrado para/).textContent).toContain("xyz");
      expect(screen.queryByText("Nenhum corte gerado.")).toBeNull();
    });

    it("paginação usa a contagem filtrada e preserva q nos links", async () => {
      setup({
        total: 40,
        filtered: 25,
        clips: [{ id: "c1", title: "Café", viralityScore: 5 }],
      });
      render(await run({ q: "café com leite", page: "2" }));
      expect(db.clip.count).toHaveBeenCalledWith({
        where: {
          uploadedFileId: "proj-s",
          OR: [
            { title: { contains: "café com leite", mode: "insensitive" } },
            { hook: { contains: "café com leite", mode: "insensitive" } },
          ],
        },
      });
      const hrefs = screen
        .getAllByRole("link")
        .map((a) => a.getAttribute("href"))
        .filter((h) => h?.includes("page="));
      // 25 filtrados / 10 por página = 3 páginas (+ anterior/próxima)
      expect(hrefs).toContain(
        "/dashboard/projects/proj-s?q=caf%C3%A9%20com%20leite&page=3",
      );
      expect(hrefs.every((h) => h!.includes("q=caf%C3%A9%20com%20leite"))).toBe(true);
      expect(hrefs.some((h) => h!.endsWith("page=4"))).toBe(false);
    });
  });
});
