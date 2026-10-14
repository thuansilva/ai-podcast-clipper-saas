/**
 * Integração de UI: `AddClipsToProjectClient` composto com a Server Action
 * REAL (`addClipsToProjectAction`), que por sua vez passa pelo schema real
 * de borda (`add-clips-to-project.schema.ts`), pelo use case real
 * (`AddClipsToProjectUseCase`) e pelos repositórios Prisma reais (Postgres
 * de teste, via `useRollbackTransactionPerTest`). Só autenticação (Clerk),
 * a fila (Inngest), `next/cache` e o router do Next são mockados — mesmo
 * padrão de `tests/integration/actions/projects-actions.integration.test.ts`,
 * aplicado aqui a partir da UI em vez de chamar a action diretamente.
 *
 * Cenários (preencher corte -> submeter -> Postgres real):
 * - Corte novo manual sem sobreposição: cria um `ProjectProcessingBatch`
 *   real (mode "manual", 1 crédito) e dispara o evento do Inngest; a UI
 *   navega para a página do projeto.
 * - Corte novo manual sobreposto a um clipe já existente: a UI bloqueia o
 *   envio (nunca chama a action/grava no banco) — mesma regra de
 *   `ManualCutOverlapError`, prevenida no cliente antes do servidor.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

const mockGetUserId = vi.fn();
vi.mock("~/infrastructure/factories/auth-factory", () => ({
  makeAuthGateway: () => ({ getUserId: mockGetUserId }),
}));

const mockInngestSend = vi.fn();
vi.mock("~/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const sliderHandlers = vi.hoisted(
  () => new Map<string, (values: number[]) => void>(),
);
vi.mock("~/components/ui/slider", () => ({
  Slider: ({ value, min, max, step, onValueChange, "data-testid": testId }: any) => {
    sliderHandlers.set(testId, onValueChange);
    return (
      <div data-testid={testId} data-min={min} data-max={max} data-step={step}>
        {(value as number[]).map((v, i) => (
          <span key={i} role="slider" aria-valuenow={v} />
        ))}
      </div>
    );
  },
}));

import { AddClipsToProjectClient } from "~/components/dashboard/add-clips-to-project-client";

describe("AddClipsToProjectClient - Integração (Server Action real + Prisma real)", () => {
  useRollbackTransactionPerTest();

  async function createUser(credits = 100) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return db.user.create({
      data: {
        id: `user_append_ui_it_${suffix}`,
        email: `append-ui-it-${suffix}@example.com`,
        password: "hashedpassword123",
        credits,
      },
    });
  }

  async function createYouTubeProjectWithClip(userId: string) {
    const project = await db.uploadedFile.create({
      data: {
        userId,
        s3Key: `youtube/${Date.now()}-project/original.mp4`,
        displayName: "Projeto existente",
        sourceType: "YOUTUBE",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 3600,
        creditsCost: 60,
        status: "processed",
      },
    });
    await db.clip.create({
      data: {
        userId,
        uploadedFileId: project.id,
        s3Key: "clips/project/clip_0.mp4",
        title: "Clip antigo",
        startTime: 0,
        endTime: 30,
        sourceStartTime: 100,
        sourceEndTime: 130,
        durationSeconds: 30,
        transcriptWords: [],
      },
    });
    return project;
  }

  afterEach(() => {
    mockInngestSend.mockReset();
    mockGetUserId.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
    sliderHandlers.clear();
  });

  it("corte manual novo sem sobreposição: grava um ProjectProcessingBatch real e dispara o evento do Inngest", async () => {
    const user = await createUser(100);
    const project = await createYouTubeProjectWithClip(user.id);
    mockGetUserId.mockResolvedValue(user.id);

    render(
      <AddClipsToProjectClient
        projectId={project.id}
        projectName={project.displayName!}
        youtubeUrl={project.youtubeUrl!}
        videoDurationSeconds={project.durationSeconds}
        usedRanges={[{ start: 100, end: 130 }]}
        userCredits={100}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));
    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), {
      target: { value: "05:00" },
    });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), {
      target: { value: "05:30" },
    });

    const submit = screen.getByRole("button", { name: /Adicionar cortes/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/dashboard/projects/${project.id}`));
    expect(mockRefresh).toHaveBeenCalled();

    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId: project.id },
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ mode: "manual", status: "queued", creditsCost: 0 });
    expect(batches[0]!.rangesJson).toMatchObject([{ startTime: 300, endTime: 330 }]);

    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    const sentEvent = mockInngestSend.mock.calls[0]![0] as { name: string; data: unknown };
    expect(sentEvent.name).toBe("append-clips-events");
    expect(sentEvent.data).toMatchObject({
      uploadedFileId: project.id,
      mode: "manual",
      manualCuts: [{ startTime: 300, endTime: 330 }],
      excludedRanges: [],
    });
  });

  it("corte manual novo sobreposto a um clipe existente: a UI bloqueia o envio antes de chamar a action/gravar no banco", async () => {
    const user = await createUser(100);
    const project = await createYouTubeProjectWithClip(user.id);
    mockGetUserId.mockResolvedValue(user.id);

    render(
      <AddClipsToProjectClient
        projectId={project.id}
        projectName={project.displayName!}
        youtubeUrl={project.youtubeUrl!}
        videoDurationSeconds={project.durationSeconds}
        usedRanges={[{ start: 100, end: 130 }]}
        userCredits={100}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Manual: eu defino/i }));
    fireEvent.change(screen.getByLabelText("Início do corte novo 1"), {
      target: { value: "01:50" },
    });
    fireEvent.change(screen.getByLabelText("Fim do corte novo 1"), {
      target: { value: "02:20" },
    });

    expect(screen.getByText(/se sobrepõe a um clipe já existente/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /Adicionar cortes/i });
    expect(submit).toBeDisabled();

    act(() => fireEvent.click(submit));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId: project.id },
    });
    expect(batches).toHaveLength(0);
  });
});
