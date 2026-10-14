/**
 * Integração: a duração exibida na tela de detalhes do projeto
 * (`src/app/dashboard/projects/[id]/page.tsx`) deve ser a soma de TODOS os
 * clipes (cortes gerados) do projeto, não:
 *
 *  - a duração do vídeo original baixado (`UploadedFile.durationSeconds`,
 *    que no modo automático é o vídeo inteiro mesmo quando o "Fatiador
 *    Inteligente" reduz o cálculo de créditos via
 *    `computeEffectiveProcessingDuration` — ver `src/inngest/functions.ts`);
 *  - apenas os clipes da página atual (`project.clips`, que é paginado por
 *    `CLIPS_PER_PAGE = 10` na própria page.tsx).
 *
 * Este teste cria mais clipes do que `CLIPS_PER_PAGE` com durações
 * determinísticas e confirma que o total exibido é o aggregate de TODOS
 * eles, em qualquer página — reproduzindo o bug que somar a partir de
 * `project.clips` teria a partir da página 2.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "~/server/db";
import ProjectDetailsPage from "~/app/dashboard/projects/[id]/page";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

// O poller de lotes (client component) usa useRouter; fora do App Router real
// precisa ser mockado.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: vi.fn(),
}));

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

describe("Página de detalhes do projeto - duração total dos cortes (Postgres real)", () => {
  useRollbackTransactionPerTest();

  const CLIPS_PER_PAGE = 10;
  const CLIPS_COUNT = 15;
  // Durações determinísticas: 10, 20, 30, ..., 150 segundos (soma = 1200s = 20 min)
  const CLIP_DURATIONS = Array.from(
    { length: CLIPS_COUNT },
    (_, i) => (i + 1) * 10,
  );
  const TOTAL_CLIPS_DURATION_SECONDS = CLIP_DURATIONS.reduce(
    (sum, d) => sum + d,
    0,
  );
  const EXPECTED_MINUTES = Math.floor(TOTAL_CLIPS_DURATION_SECONDS / 60);
  // Duração do vídeo original é bem diferente da soma dos cortes, para
  // garantir que o teste pegaria uma regressão que voltasse a exibir
  // `project.durationSeconds`.
  const ORIGINAL_VIDEO_DURATION_SECONDS = 7200; // 120 min

  async function createUser() {
    const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return db.user.create({
      data: {
        id: `user_dur_${suffix}`,
        email: `dur-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        reservedCredits: 0,
      },
    });
  }

  async function createProjectWithClips(userId: string) {
    const file = await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `youtube/dur-${Date.now()}.mp4`,
        displayName: "Podcast com muitos cortes",
        status: "processed",
        sourceType: "YOUTUBE",
        durationSeconds: ORIGINAL_VIDEO_DURATION_SECONDS,
      },
    });

    for (let i = 0; i < CLIP_DURATIONS.length; i++) {
      await db.clip.create({
        data: {
          userId,
          uploadedFileId: file.id,
          s3Key: `clips/dur-${file.id}-${i}.mp4`,
          title: `Corte ${i + 1}`,
          startTime: 0,
          endTime: CLIP_DURATIONS[i],
          durationSeconds: CLIP_DURATIONS[i],
          transcriptWords: [],
        },
      });
    }

    return file;
  }

  it("soma a duração de TODOS os clipes (não só a página atual) na página 1", async () => {
    const user = await createUser();
    const file = await createProjectWithClips(user.id);
    mockGetUserId.mockResolvedValue(user.id);

    const result = await ProjectDetailsPage({
      params: Promise.resolve({ id: file.id }),
      searchParams: Promise.resolve({}),
    });
    render(result);

    expect(
      await screen.findByText(
        new RegExp(`${EXPECTED_MINUTES} min de cortes gerados`),
      ),
    ).toBeDefined();
    // Não deve exibir a duração do vídeo original como se fosse a dos cortes.
    expect(
      screen.queryByText(/120 min de cortes gerados/),
    ).toBeNull();
  });

  it("mantém o mesmo total na página 2, mesmo mostrando outro subconjunto de clipes", async () => {
    const user = await createUser();
    const file = await createProjectWithClips(user.id);
    mockGetUserId.mockResolvedValue(user.id);

    const resultPage2 = await ProjectDetailsPage({
      params: Promise.resolve({ id: file.id }),
      searchParams: Promise.resolve({ page: "2" }),
    });
    render(resultPage2);

    // Página 2 mostra apenas os clipes restantes (15 - 10 = 5), não todos.
    expect(
      screen.getAllByText(/^Corte \d+$/).length,
    ).toBe(CLIPS_COUNT - CLIPS_PER_PAGE);

    // Mas o total de duração exibido continua sendo a soma de TODOS os 15.
    expect(
      await screen.findByText(
        new RegExp(`${EXPECTED_MINUTES} min de cortes gerados`),
      ),
    ).toBeDefined();
  });
});
