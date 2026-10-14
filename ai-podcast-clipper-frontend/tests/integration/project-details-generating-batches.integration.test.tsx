/**
 * Integração: feedback de lotes "adicionar cortes" em geração na tela de
 * detalhes do projeto (`src/app/dashboard/projects/[id]/page.tsx`) contra o
 * Postgres real.
 *
 * Dados determinísticos (base para um e2e futuro): seletores estáveis
 * `clips-generating-banner`, `clip-generating-placeholder`,
 * `clips-batch-failed-alert` e `add-clips-slot`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { db } from "~/server/db";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

describe("Página de detalhes do projeto - lotes em geração (Postgres real)", () => {
  useRollbackTransactionPerTest();

  async function seed() {
    const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user = await db.user.create({
      data: {
        id: `user_batch_${suffix}`,
        email: `batch-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        reservedCredits: 0,
      },
    });
    const file = await db.uploadedFile.create({
      data: {
        userId: user.id,
        s3Key: `youtube/batch-${suffix}.mp4`,
        displayName: "Projeto com lotes",
        status: "processed",
        sourceType: "YOUTUBE",
        durationSeconds: 3600,
      },
    });
    const other = await db.uploadedFile.create({
      data: {
        userId: user.id,
        s3Key: `youtube/batch-other-${suffix}.mp4`,
        displayName: "Outro projeto",
        status: "processed",
        sourceType: "YOUTUBE",
        durationSeconds: 3600,
      },
    });
    return { user, file, other };
  }

  async function renderPage(fileId: string) {
    render(
      await ProjectDetailsPage({
        params: Promise.resolve({ id: fileId }),
        searchParams: Promise.resolve({}),
      }),
    );
  }

  it("lote manual queued + auto processing: banner, 3 placeholders e botão desabilitado", async () => {
    const { user, file, other } = await seed();
    mockGetUserId.mockResolvedValue(user.id);
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "manual",
        status: "queued",
        rangesJson: [
          { startTime: 60, endTime: 120, title: "Abertura" },
          { startTime: 600, endTime: 660 },
        ],
      },
    });
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "auto",
        status: "processing",
        rangesJson: { startTime: 720, endTime: 1320 },
      },
    });
    // Lote ativo de OUTRO projeto não pode vazar.
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: other.id,
        mode: "manual",
        status: "processing",
        rangesJson: [{ startTime: 0, endTime: 30 }],
      },
    });

    await renderPage(file.id);

    expect(screen.getByTestId("clips-generating-banner").textContent).toContain(
      "Gerando 3 cortes…",
    );
    const cards = screen.getAllByTestId("clip-generating-placeholder");
    expect(cards).toHaveLength(3);
    const text = cards.map((c) => c.textContent).join("|");
    expect(text).toContain("Abertura");
    expect(text).toContain("01:00 – 02:00");
    expect(text).toContain("IA analisando");
    expect(text).toContain("12:00 – 22:00");
    expect(within(cards[0]!).getByText("Na fila")).toBeDefined();
    expect(screen.getByTestId("add-clips-slot").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByTestId("clips-batch-failed-alert")).toBeNull();
  });

  it("lote mais recente failed: alerta com errorMessage e créditos devolvidos; sem placeholders", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "manual",
        status: "failed",
        errorMessage: "Vídeo indisponível no YouTube",
        creditsCost: 4,
        rangesJson: [{ startTime: 0, endTime: 60 }],
      },
    });

    await renderPage(file.id);

    const alert = screen.getByTestId("clips-batch-failed-alert");
    expect(alert.textContent).toContain("Vídeo indisponível no YouTube");
    expect(alert.textContent).toContain("4 créditos reservados");
    expect(screen.queryAllByTestId("clip-generating-placeholder")).toHaveLength(0);
    expect(screen.getByTestId("add-clips-slot").getAttribute("href")).toBe(
      `/dashboard/projects/${file.id}/add-clips`,
    );
  });

  it("falha antiga é ocultada quando um lote novo é criado; só o ativo aparece", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "manual",
        status: "failed",
        errorMessage: "erro antigo",
        rangesJson: [{ startTime: 0, endTime: 60 }],
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "manual",
        status: "queued",
        rangesJson: [{ startTime: 100, endTime: 160 }],
      },
    });

    await renderPage(file.id);

    expect(screen.queryByTestId("clips-batch-failed-alert")).toBeNull();
    expect(screen.getAllByTestId("clip-generating-placeholder")).toHaveLength(1);
  });

  it("lote processed: nenhum feedback", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);
    await db.projectProcessingBatch.create({
      data: {
        uploadedFileId: file.id,
        mode: "auto",
        status: "processed",
        rangesJson: { startTime: 0, endTime: 600 },
      },
    });

    await renderPage(file.id);

    expect(screen.queryByTestId("clips-generating-banner")).toBeNull();
    expect(screen.queryByTestId("clips-batch-failed-alert")).toBeNull();
    expect(screen.queryAllByTestId("clip-generating-placeholder")).toHaveLength(0);
  });
});
