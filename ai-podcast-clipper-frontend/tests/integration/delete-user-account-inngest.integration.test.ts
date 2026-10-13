/**
 * @vitest-environment node
 *
 * Teste de integração (Postgres real): function `deleteUserAccount`
 * (`src/inngest/functions.ts`), disparada pelo evento `clerk/user.deleted`
 * — fecha o item HIGH do checklist de go-live "Fluxo de exclusão de conta
 * incompleto".
 *
 * Desde 2026-10-12, é esta function do Inngest (não mais o handler do
 * webhook) que executa a limpeza de verdade, em 3 `step.run`s separados
 * (`cancel-subscription`, `delete-storage-files`,
 * `anonymize-user-and-delete-rows`) com `retries: 3` — ver
 * `tests/integration/clerk-webhook-account-deletion.integration.test.ts`
 * para o teste do webhook (que agora só despacha o evento).
 *
 * Invocado via `.fn` diretamente (mesmo padrão de
 * `tests/integration/inngest-pipeline.test.ts` e
 * `tests/integration/inngest-billing-step-idempotency.integration.test.ts`),
 * com `stripe` mockado (evita uma chamada de rede real para
 * `subscriptions.cancel`; mesma técnica de
 * `tests/unit/infrastructure/stripe-payment.gateway.test.ts`) — toda a
 * lógica de negócio real (`CancelUserSubscriptionUseCase`,
 * `DeleteUserFilesFromStorageUseCase`, `AnonymizeUserAndDeleteRowsUseCase`,
 * repositórios Prisma, `PrismaUnitOfWork`, `S3StorageGateway` contra o
 * MinIO local do docker-compose) roda de verdade.
 *
 * Confirma a decisão de produto: vídeos/clipes são apagados de verdade,
 * a assinatura é cancelada de verdade, mas o cadastro do `User` nunca é
 * removido do banco — é anonimizado — para preservar o histórico de
 * auditoria em `CreditTransaction`.
 */
import { describe, it, expect, vi } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";
import { deleteUserAccount, type PipelineStep } from "~/inngest/functions";

const mockSubscriptionsCancel = vi.fn();

vi.mock("stripe", () => {
  class MockStripe {
    subscriptions = {
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    };
  }
  return { default: MockStripe };
});

describe("Inngest deleteUserAccount - limpeza real (Postgres real)", () => {
  useRollbackTransactionPerTest();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (deleteUserAccount as any).fn;

  function uniqueId(label: string): string {
    return `user_clerk_delete_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** `step` "real": roda o callback imediatamente, sem memoização. */
  function createRealStep(): PipelineStep {
    return {
      run: async (_name: string, stepFn: () => unknown) => await stepFn(),
    } as unknown as PipelineStep;
  }

  function buildEventPayload(userId: string, step: PipelineStep) {
    return { event: { data: { userId } }, step };
  }

  it(
    "anonimiza o usuário, apaga UploadedFile/Clip, cancela a assinatura " +
      "ativa no Stripe e preserva o CreditTransaction para auditoria",
    async () => {
      mockSubscriptionsCancel.mockResolvedValueOnce({});

      const userId = uniqueId("full");
      const originalEmail = `real-${userId}@example.com`;

      const user = await db.user.create({
        data: {
          id: userId,
          email: originalEmail,
          name: "Nome Real do Usuário",
          image: "https://avatar.example.com/real.png",
          password: "hashedpassword123",
          credits: 130,
          subscriptionCredits: 80,
          oneTimeCredits: 50,
          plan: "PRO",
          stripeCustomerId: `cus_${userId}`,
        },
      });

      await db.subscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: `sub_${userId}`,
          stripePriceId: "price_pro_monthly_test",
          status: "active",
          plan: "PRO",
          monthlyCredits: 300,
          currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      });

      const uploadedFile = await db.uploadedFile.create({
        data: {
          userId: user.id,
          s3Key: `uploads/${userId}/video.mp4`,
          sourceType: "YOUTUBE",
          status: "processed",
        },
      });

      const clip = await db.clip.create({
        data: {
          userId: user.id,
          uploadedFileId: uploadedFile.id,
          s3Key: `clips/${userId}/clip-1.mp4`,
          title: "Clip de teste",
          startTime: 0,
          endTime: 10,
          durationSeconds: 10,
        },
      });

      const creditTransaction = await db.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -10,
          type: "CONSUME",
          description: "Processamento de teste (auditoria)",
        },
      });

      await fn(buildEventPayload(userId, createRealStep()));

      // 1. O cadastro do User CONTINUA existindo (nunca é removido) — mas
      // anonimizado.
      const persistedUser = await db.user.findUnique({ where: { id: userId } });
      expect(persistedUser).not.toBeNull();
      expect(persistedUser?.email).toBe(`deleted-${userId}@anon.local`);
      expect(persistedUser?.name).toBeNull();
      expect(persistedUser?.image).toBeNull();
      expect(persistedUser?.deletedAt).not.toBeNull();

      // 2. UploadedFile/Clip da pessoa foram removidos do banco.
      const remainingFiles = await db.uploadedFile.findMany({
        where: { userId },
      });
      expect(remainingFiles).toHaveLength(0);
      const remainingClips = await db.clip.findMany({ where: { userId } });
      expect(remainingClips).toHaveLength(0);

      await expect(
        db.uploadedFile.findUnique({ where: { id: uploadedFile.id } })
      ).resolves.toBeNull();
      await expect(
        db.clip.findUnique({ where: { id: clip.id } })
      ).resolves.toBeNull();

      // 3. A assinatura foi cancelada de verdade no Stripe (mock) e o
      // status no banco está "canceled".
      expect(mockSubscriptionsCancel).toHaveBeenCalledWith(`sub_${userId}`);
      const persistedSubscription = await db.subscription.findUnique({
        where: { userId },
      });
      expect(persistedSubscription?.status).toBe("canceled");

      // 4. CreditTransaction NÃO foi tocado — continua existindo, íntegro,
      // para auditoria.
      const persistedTransaction = await db.creditTransaction.findUnique({
        where: { id: creditTransaction.id },
      });
      expect(persistedTransaction).not.toBeNull();
      expect(persistedTransaction?.amount).toBe(-10);
      expect(persistedTransaction?.type).toBe("CONSUME");
    }
  );

  it(
    "usuário sem assinatura e sem arquivos: apenas anonimiza, sem chamar o Stripe",
    async () => {
      const userId = uniqueId("minimal");

      await db.user.create({
        data: {
          id: userId,
          email: `real-${userId}@example.com`,
          name: "Fulano Simples",
          password: "hashedpassword123",
          credits: 10,
          plan: "STARTER",
        },
      });

      await fn(buildEventPayload(userId, createRealStep()));

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();

      const persistedUser = await db.user.findUnique({ where: { id: userId } });
      expect(persistedUser).not.toBeNull();
      expect(persistedUser?.email).toBe(`deleted-${userId}@anon.local`);
      expect(persistedUser?.deletedAt).not.toBeNull();
    }
  );

  it(
    "reentrega do mesmo evento (Clerk/Inngest retry) após o usuário já ter sido " +
      "anonimizado: idempotente, não lança erro",
    async () => {
      const userId = uniqueId("retry");

      await db.user.create({
        data: {
          id: userId,
          email: `real-${userId}@example.com`,
          password: "hashedpassword123",
          credits: 5,
          plan: "STARTER",
        },
      });

      await expect(
        fn(buildEventPayload(userId, createRealStep()))
      ).resolves.not.toThrow();

      await expect(
        fn(buildEventPayload(userId, createRealStep()))
      ).resolves.not.toThrow();

      const persistedUser = await db.user.findUnique({ where: { id: userId } });
      expect(persistedUser?.email).toBe(`deleted-${userId}@anon.local`);
    }
  );

  it("cada sub-etapa roda em seu próprio step.run nomeado, na ordem certa", async () => {
    const userId = uniqueId("steps");

    await db.user.create({
      data: {
        id: userId,
        email: `real-${userId}@example.com`,
        password: "hashedpassword123",
        credits: 5,
        plan: "STARTER",
      },
    });

    const stepNames: string[] = [];
    const trackingStep: PipelineStep = {
      run: async (name: string, stepFn: () => unknown) => {
        stepNames.push(name);
        return await stepFn();
      },
    } as unknown as PipelineStep;

    await fn(buildEventPayload(userId, trackingStep));

    expect(stepNames).toEqual([
      "cancel-subscription",
      "delete-storage-files",
      "anonymize-user-and-delete-rows",
    ]);
  });

  it(
    "retry parcial: se delete-storage-files falhar, cancel-subscription " +
      "(memoizado) não roda de novo numa 2ª tentativa com o mesmo step",
    async () => {
      const userId = uniqueId("partial-retry");

      await db.user.create({
        data: {
          id: userId,
          email: `real-${userId}@example.com`,
          password: "hashedpassword123",
          credits: 5,
          plan: "STARTER",
        },
      });

      await db.uploadedFile.create({
        data: {
          userId,
          s3Key: `uploads/${userId}/video.mp4`,
          sourceType: "YOUTUBE",
          status: "processed",
        },
      });

      // Mock de step que memoiza por nome (simula a memória de um run entre
      // a tentativa original e um retry, mesma técnica de
      // `tests/integration/inngest-billing-step-idempotency.integration.test.ts`),
      // e falha a primeira vez que "delete-storage-files" rodar.
      const cache = new Map<string, unknown>();
      let deleteStorageAttempts = 0;
      const flakyMemoizingStep: PipelineStep = {
        run: async (name: string, stepFn: () => unknown) => {
          if (cache.has(name)) {
            return cache.get(name);
          }
          if (name === "delete-storage-files") {
            deleteStorageAttempts++;
            if (deleteStorageAttempts === 1) {
              throw new Error("MinIO fora do ar (simulado)");
            }
          }
          const result = await stepFn();
          cache.set(name, result);
          return result;
        },
      } as unknown as PipelineStep;

      const eventPayload = buildEventPayload(userId, flakyMemoizingStep);

      await expect(fn(eventPayload)).rejects.toThrow(
        "MinIO fora do ar (simulado)"
      );
      expect(mockSubscriptionsCancel).not.toHaveBeenCalled(); // sem assinatura, no-op

      // Usuário ainda não foi anonimizado — a etapa 3 nunca rodou.
      const userAfterFailure = await db.user.findUnique({
        where: { id: userId },
      });
      expect(userAfterFailure?.deletedAt).toBeNull();

      // Retry: "cancel-subscription" já está memoizado, não roda de novo;
      // "delete-storage-files" é tentado de novo e, desta vez, sucede.
      await fn(eventPayload);
      expect(deleteStorageAttempts).toBe(2);

      const userAfterRetry = await db.user.findUnique({
        where: { id: userId },
      });
      expect(userAfterRetry?.deletedAt).not.toBeNull();
    }
  );
});
