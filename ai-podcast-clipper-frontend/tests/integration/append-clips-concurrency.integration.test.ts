/**
 * @vitest-environment node
 *
 * Auditoria de segurança — race condition de "adicionar mais cortes"
 * (`AddClipsToProjectUseCase`), com Postgres REAL e concorrência REAL.
 *
 * Cenário de exploração: o usuário abre 2 abas (ou dispara 2 requests via
 * curl na Server Action) e submete 2 appends ao mesmo tempo para o mesmo
 * projeto. Antes da correção, as duas execuções liam
 * `findActiveByUploadedFileId` (vazio) ANTES de qualquer uma criar o lote,
 * e ambas criavam um `ProjectProcessingBatch` "queued" + enviavam um evento
 * cada. Consequências: a checagem de sobreposição com clipes existentes
 * (RN de "adicionar mais cortes") era contornada entre os dois lotes (os
 * dois podiam gerar clipes do mesmo trecho), e o usuário era cobrado 2x por
 * conteúdo duplicado. O `concurrency: { limit: 1, key: uploadedFileId }` do
 * Inngest não protege isso: ele só serializa STEPS de runs já disparadas,
 * nunca impede que 2 lotes sejam criados/enfileirados.
 *
 * IMPORTANTE: este teste NÃO usa `useRollbackTransactionPerTest()`: dentro
 * da transação de teste única, as duas execuções compartilhariam a mesma
 * conexão/transação e o lock de linha nunca bloquearia uma à outra
 * (mascarando o bug e a correção). Mesmo padrão de
 * `prisma-unit-of-work-atomicity.integration.test.ts`/`credit-service.test.ts`:
 * commit real + limpeza manual.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "~/server/db";

const mockInngestSend = vi.fn();
vi.mock("~/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
    createFunction: () => ({}),
  },
}));

import { AddClipsToProjectUseCase } from "~/application/use-cases/add-clips-to-project.use-case";
import { PrismaUploadedFileRepository } from "~/infrastructure/database/repositories/prisma-uploaded-file.repository";
import { PrismaClipRepository } from "~/infrastructure/database/repositories/prisma-clip.repository";
import { PrismaProcessingBatchRepository } from "~/infrastructure/database/repositories/prisma-processing-batch.repository";
import { InngestQueueGateway } from "~/infrastructure/queue/inngest-queue.gateway";
import { ProjectBatchInProgressError } from "~/domain/errors/project-batch-in-progress-error";
import type { ClipEntity } from "~/domain/entities/clip";

/**
 * Repositório de clipes REAL (Prisma) com uma latência artificial na
 * leitura, que fica entre a checagem "há lote ativo?" e a criação do lote.
 * Num ambiente serverless real (várias instâncias, latência de rede até o
 * Postgres) essa janela existe naturalmente; localmente, com o Postgres na
 * mesma máquina, as queries são rápidas demais para a janela aparecer de
 * forma determinística — a latência só torna o cenário reproduzível.
 */
class SlowPrismaClipRepository extends PrismaClipRepository {
  override async findByUploadedFileId(uploadedFileId: string): Promise<ClipEntity[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return super.findByUploadedFileId(uploadedFileId);
  }
}

function makeUseCaseWithRealPrisma() {
  return new AddClipsToProjectUseCase(
    new PrismaUploadedFileRepository(),
    new SlowPrismaClipRepository(),
    new PrismaProcessingBatchRepository(),
    new InngestQueueGateway(),
  );
}

describe("AddClipsToProjectUseCase — 2 appends simultâneos no mesmo projeto (Postgres real, sem transação de teste)", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    mockInngestSend.mockReset();
    if (createdUserIds.length > 0) {
      // Cascade: UploadedFile -> ProjectProcessingBatch/Clip.
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  async function createUserWithYouTubeProject() {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await db.user.create({
      data: {
        id: `user_append_race_${suffix}`,
        email: `append-race-${suffix}@example.com`,
        password: "hashedpassword123",
        credits: 100,
        oneTimeCredits: 100,
        subscriptionCredits: 0,
        reservedCredits: 0,
      },
    });
    createdUserIds.push(user.id);
    const project = await db.uploadedFile.create({
      data: {
        userId: user.id,
        s3Key: `youtube/${suffix}/original.mp4`,
        displayName: "Projeto race",
        sourceType: "YOUTUBE",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSeconds: 3600,
        status: "processed",
      },
    });
    return { user, project };
  }

  it("cria no máximo 1 lote e envia no máximo 1 evento; a outra request recebe ProjectBatchInProgressError", async () => {
    const { user, project } = await createUserWithYouTubeProject();

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        makeUseCaseWithRealPrisma().execute({
          projectId: project.id,
          userId: user.id,
          mode: "manual",
          manualCuts: [{ startTime: 100 + i, endTime: 130 + i }],
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ProjectBatchInProgressError);
    }

    const batches = await db.projectProcessingBatch.findMany({
      where: { uploadedFileId: project.id },
    });
    expect(batches).toHaveLength(1);
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
  });
});
