/**
 * Integração: busca de cortes (`?q=`) na tela de detalhes do projeto
 * (`src/app/dashboard/projects/[id]/page.tsx`) contra o Postgres real.
 *
 * Dados determinísticos: 12 clipes "Corte Alfa NN" (título) + 2 clipes
 * "Corte Beta" com hook contendo "FUTEBOL" (para validar busca por hook e
 * case-insensitive) + 1 clipe de OUTRO projeto com título "Alfa" (não pode
 * vazar). O header deve continuar mostrando o total e a duração de TODOS
 * os cortes do projeto, independentemente do filtro.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "~/server/db";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

describe("Página de detalhes do projeto - busca de cortes (Postgres real)", () => {
  useRollbackTransactionPerTest();

  const ALFA_COUNT = 12;
  const BETA_COUNT = 2;
  const CLIP_DURATION = 60;

  async function seed() {
    const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user = await db.user.create({
      data: {
        id: `user_search_${suffix}`,
        email: `search-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        reservedCredits: 0,
      },
    });
    const makeFile = (name: string) =>
      db.uploadedFile.create({
        data: {
          userId: user.id,
          s3Key: `youtube/search-${name}-${suffix}.mp4`,
          displayName: name,
          status: "processed",
          sourceType: "YOUTUBE",
          durationSeconds: 3600,
        },
      });
    const file = await makeFile("Projeto A");
    const other = await makeFile("Projeto B");

    const makeClip = (
      fileId: string,
      key: string,
      title: string,
      hook?: string,
    ) =>
      db.clip.create({
        data: {
          userId: user.id,
          uploadedFileId: fileId,
          s3Key: `clips/search-${key}-${suffix}.mp4`,
          title,
          hook,
          startTime: 0,
          endTime: CLIP_DURATION,
          durationSeconds: CLIP_DURATION,
          transcriptWords: [],
        },
      });

    for (let i = 1; i <= ALFA_COUNT; i++) {
      await makeClip(file.id, `a${i}`, `Corte Alfa ${String(i).padStart(2, "0")}`);
    }
    for (let i = 1; i <= BETA_COUNT; i++) {
      await makeClip(file.id, `b${i}`, `Corte Beta ${i}`, "Discussão sobre FUTEBOL");
    }
    await makeClip(other.id, "other", "Alfa de outro projeto");

    return { user, file };
  }

  async function renderPage(
    fileId: string,
    searchParams: Record<string, string> = {},
  ) {
    render(
      await ProjectDetailsPage({
        params: Promise.resolve({ id: fileId }),
        searchParams: Promise.resolve(searchParams),
      }),
    );
  }

  const TOTAL = ALFA_COUNT + BETA_COUNT;
  const TOTAL_MINUTES = (TOTAL * CLIP_DURATION) / 60;

  it("filtra por título (case-insensitive), pagina pela contagem filtrada e preserva q nos links", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);

    await renderPage(file.id, { q: "alfa" });

    // 12 resultados -> 10 na página 1 e 2 páginas de paginação.
    expect(screen.getAllByText(/^Corte Alfa \d+$/).length).toBe(10);
    expect(screen.queryByText(/Corte Beta/)).toBeNull();
    expect(screen.queryByText("Alfa de outro projeto")).toBeNull();

    const pageLinks = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.includes("page="));
    expect(pageLinks).toContain(`/dashboard/projects/${file.id}?q=alfa&page=2`);
    expect(pageLinks.some((h) => h!.endsWith("page=3"))).toBe(false);

    // Header continua sobre TODOS os cortes do projeto.
    expect(screen.getByText(`${TOTAL} cortes gerados`)).toBeDefined();
    expect(screen.getByText(`${TOTAL_MINUTES} min de cortes gerados`)).toBeDefined();
  });

  it("página 2 do filtro mostra só o restante dos resultados", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);

    await renderPage(file.id, { q: "ALFA", page: "2" });

    expect(screen.getAllByText(/^Corte Alfa \d+$/).length).toBe(ALFA_COUNT - 10);
  });

  it("busca também pelo hook", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);

    await renderPage(file.id, { q: "futebol" });

    expect(screen.getAllByText(/^Corte Beta \d+$/).length).toBe(BETA_COUNT);
    expect(screen.queryByText(/Corte Alfa/)).toBeNull();
  });

  it("mostra estado vazio específico quando nada corresponde", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);

    await renderPage(file.id, { q: "inexistente" });

    expect(screen.getByTestId("clips-search-empty").textContent).toContain(
      "Nenhum corte encontrado para",
    );
    expect(screen.getByTestId("clips-search-empty").textContent).toContain(
      "inexistente",
    );
    expect(screen.getByTestId("clips-search")).toHaveValue("inexistente");
  });

  it("sem q lista todos os cortes do projeto", async () => {
    const { user, file } = await seed();
    mockGetUserId.mockResolvedValue(user.id);

    await renderPage(file.id);

    expect(screen.getAllByText(/^Corte (Alfa|Beta)/).length).toBe(10);
    expect(screen.queryByTestId("clips-search-empty")).toBeNull();
  });
});
