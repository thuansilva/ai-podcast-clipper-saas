import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: {
    uploadedFile: { findUnique: vi.fn() },
    clip: { aggregate: vi.fn(), count: vi.fn() },
    projectProcessingBatch: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

const project = (clips = 0) => ({
  id: "proj-1",
  userId: "user-1",
  displayName: "Podcast",
  durationSeconds: 3600,
  status: "processed",
  youtubeUrl: null,
  thumbnailUrl: null,
  _count: { clips },
  clips: [],
});

const batch = (over: Record<string, unknown>) => ({
  id: "b1",
  uploadedFileId: "proj-1",
  mode: "manual",
  status: "queued",
  rangesJson: [],
  errorMessage: null,
  creditsCost: 0,
  createdAt: new Date(),
  ...over,
});

async function renderPage(searchParams: Record<string, string> = {}) {
  render(
    await ProjectDetailsPage({
      params: Promise.resolve({ id: "proj-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("ProjectDetailsPage - feedback de lotes em geração", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(makeAuthGateway).mockReturnValue({
      getUserId: vi.fn().mockResolvedValue("user-1"),
    } as any);
    vi.mocked(db.clip.aggregate).mockResolvedValue({ _sum: { durationSeconds: null } } as any);
    vi.mocked(db.clip.count).mockResolvedValue(0);
    vi.mocked(db.uploadedFile.findUnique).mockResolvedValue(project() as any);
    vi.mocked(db.projectProcessingBatch.findMany).mockResolvedValue([]);
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue(null);
  });

  it("consulta lotes ativos (queued/processing) e o mais recente, escopados ao projeto", async () => {
    await renderPage();
    expect(db.projectProcessingBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadedFileId: "proj-1", status: { in: ["queued", "processing"] } },
      }),
    );
    expect(db.projectProcessingBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadedFileId: "proj-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("sem lotes: nada de banner, placeholders ou alerta; botão é link ativo", async () => {
    await renderPage();
    expect(screen.queryByTestId("clips-generating-banner")).toBeNull();
    expect(screen.queryAllByTestId("clip-generating-placeholder")).toHaveLength(0);
    expect(screen.queryByTestId("clips-batch-failed-alert")).toBeNull();
    expect(screen.getByTestId("add-clips-slot").getAttribute("href")).toBe(
      "/dashboard/projects/proj-1/add-clips",
    );
  });

  it("lote manual ativo: banner, 1 placeholder por corte, status e botão desabilitado", async () => {
    vi.mocked(db.projectProcessingBatch.findMany).mockResolvedValue([
      batch({
        status: "processing",
        rangesJson: [
          { startTime: 60, endTime: 125, title: "Intro" },
          { startTime: 300, endTime: 360 },
        ],
      }),
    ] as any);
    await renderPage();

    expect(screen.getByTestId("clips-generating-banner").textContent).toContain(
      "Gerando 2 cortes…",
    );
    expect(screen.getByTestId("clips-generating-banner").textContent).toContain(
      "A página atualiza sozinha",
    );
    const cards = screen.getAllByTestId("clip-generating-placeholder");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.getAttribute("aria-busy")).toBe("true");
    expect(within(cards[0]!).getByText("Intro")).toBeDefined();
    expect(within(cards[0]!).getByText("01:00 – 02:05")).toBeDefined();
    expect(within(cards[0]!).getByText("Gerando…")).toBeDefined();

    const slot = screen.getByTestId("add-clips-slot");
    expect(slot.getAttribute("href")).toBeNull();
    expect(slot.getAttribute("aria-disabled")).toBe("true");
    expect(slot.getAttribute("title")).toBe(
      "Aguarde os cortes em geração terminarem",
    );
  });

  it("lote auto na fila: card 'IA analisando' com o trecho e status 'Na fila'", async () => {
    vi.mocked(db.projectProcessingBatch.findMany).mockResolvedValue([
      batch({ mode: "auto", status: "queued", rangesJson: { startTime: 720, endTime: 1320 } }),
    ] as any);
    await renderPage();
    const [card] = screen.getAllByTestId("clip-generating-placeholder");
    expect(within(card!).getByText("IA analisando")).toBeDefined();
    expect(within(card!).getByText("12:00 – 22:00")).toBeDefined();
    expect(within(card!).getByText("Na fila")).toBeDefined();
  });

  it("não mostra placeholders na página 2 nem com busca ativa (banner continua)", async () => {
    vi.mocked(db.projectProcessingBatch.findMany).mockResolvedValue([
      batch({ rangesJson: [{ startTime: 0, endTime: 30 }] }),
    ] as any);
    await renderPage({ page: "2" });
    expect(screen.queryAllByTestId("clip-generating-placeholder")).toHaveLength(0);
    expect(screen.getByTestId("clips-generating-banner")).toBeDefined();
  });

  it("lote mais recente falhou com créditos reservados: alerta com erro e devolução", async () => {
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue(
      batch({ status: "failed", errorMessage: "Vídeo indisponível", creditsCost: 5 }) as any,
    );
    await renderPage();
    const alert = screen.getByTestId("clips-batch-failed-alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("Não foi possível gerar os cortes");
    expect(alert.textContent).toContain("Vídeo indisponível");
    expect(alert.textContent).toContain("5 créditos reservados");
    expect(alert.textContent).toContain("devolvidos");
    expect(screen.queryByTestId("clips-generating-banner")).toBeNull();
    expect(screen.getByTestId("add-clips-slot").getAttribute("href")).toBe(
      "/dashboard/projects/proj-1/add-clips",
    );
  });

  it("lote falhou antes de reservar créditos: informa que nada foi cobrado", async () => {
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue(
      batch({ status: "failed", errorMessage: null, creditsCost: 0 }) as any,
    );
    await renderPage();
    expect(screen.getByTestId("clips-batch-failed-alert").textContent).toContain(
      "Nenhum crédito foi cobrado",
    );
  });

  it("lote mais recente processado (mesmo havendo falha antiga): sem alerta", async () => {
    vi.mocked(db.projectProcessingBatch.findFirst).mockResolvedValue(
      batch({ status: "processed" }) as any,
    );
    await renderPage();
    expect(screen.queryByTestId("clips-batch-failed-alert")).toBeNull();
  });
});
