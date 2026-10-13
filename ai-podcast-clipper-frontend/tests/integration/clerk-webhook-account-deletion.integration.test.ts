/**
 * @vitest-environment node
 *
 * Testes de integração: evento `user.deleted` do webhook do Clerk, com
 * Postgres real (docker-compose) — fecha o item HIGH do checklist de
 * go-live "Fluxo de exclusão de conta incompleto".
 *
 * Bate na rota real (`POST` do route handler, mesmo padrão de
 * `tests/integration/stripe-webhook-idempotency.integration.test.ts` e
 * `tests/integration/webhook-subscription-plans.integration.test.ts`), só
 * com `svix` mockado (bypassa a verificação de assinatura — mesma técnica
 * já usada em `tests/unit/api/clerk-webhook.test.ts`) e o SDK `stripe`
 * mockado (evita uma chamada de rede real para `subscriptions.cancel`;
 * mesma técnica de `tests/unit/infrastructure/stripe-payment.gateway.test.ts`)
 * — toda a lógica de negócio real (`DeleteUserAccountUseCase`,
 * repositórios Prisma, `PrismaUnitOfWork`, `S3StorageGateway` contra o MinIO
 * local do docker-compose) roda de verdade.
 *
 * Confirma a decisão de produto: vídeos/clipes são apagados de verdade,
 * a assinatura é cancelada de verdade, mas o cadastro do `User` nunca é
 * removido do banco — é anonimizado — para preservar o histórico de
 * auditoria em `CreditTransaction`.
 */
import { describe, it, expect, vi } from "vitest";
import { db } from "~/server/db";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

const mockSubscriptionsCancel = vi.fn();

vi.mock("stripe", () => {
  class MockStripe {
    subscriptions = {
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    };
  }
  return { default: MockStripe };
});

vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    verify(payload: string) {
      return JSON.parse(payload);
    }
  },
}));

// Importado DEPOIS dos vi.mock acima (hoisted pelo Vitest para o topo do
// módulo de qualquer forma, mas mantido aqui embaixo por clareza de leitura).
import { POST } from "~/app/api/webhooks/clerk/route";

describe("Clerk Webhook user.deleted - Integração (Postgres real)", () => {
  useRollbackTransactionPerTest();

  function uniqueId(label: string): string {
    return `user_clerk_delete_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function buildDeletedUserRequest(userId: string): Request {
    const payload = JSON.stringify({
      type: "user.deleted",
      data: { id: userId },
    });

    return new Request("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      headers: {
        "svix-id": `msg_${userId}`,
        "svix-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "svix-signature": "v1,signature",
      },
      body: payload,
    });
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

      const response = await POST(buildDeletedUserRequest(userId));
      expect(response.status).toBe(200);

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

      const response = await POST(buildDeletedUserRequest(userId));
      expect(response.status).toBe(200);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();

      const persistedUser = await db.user.findUnique({ where: { id: userId } });
      expect(persistedUser).not.toBeNull();
      expect(persistedUser?.email).toBe(`deleted-${userId}@anon.local`);
      expect(persistedUser?.deletedAt).not.toBeNull();
    }
  );

  it(
    "reentrega do mesmo evento (Clerk retry) após o usuário já ter sido " +
      "anonimizado: idempotente, não lança erro e responde 200",
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

      const firstResponse = await POST(buildDeletedUserRequest(userId));
      expect(firstResponse.status).toBe(200);

      const secondResponse = await POST(buildDeletedUserRequest(userId));
      expect(secondResponse.status).toBe(200);

      const persistedUser = await db.user.findUnique({ where: { id: userId } });
      expect(persistedUser?.email).toBe(`deleted-${userId}@anon.local`);
    }
  );
});
