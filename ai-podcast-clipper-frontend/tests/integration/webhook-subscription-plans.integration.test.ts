/**
 * @vitest-environment node
 *
 * Testes de integração: fluxo completo de webhook de assinatura do Stripe,
 * passando pelo banco Postgres real (docker-compose), validando que os 4 planos
 * reais (Starter/Pro × Mensal/Anual) atribuem os créditos corretos.
 *
 * Objetivo: comprovar que:
 * - Os 4 price IDs reais do env.js resolvem para planos e créditos corretos
 * - Price IDs desconhecidos geram erro explícito (sem fallback silencioso)
 * - Price IDs de créditos avulsos (descontinuados) são rejeitados
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "~/server/db";
import {
  makeProcessSubscriptionCheckoutUseCase,
  makeProcessSubscriptionRenewalUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { env } from "~/env";

describe("Webhook Subscription Plans - Integration (Banco Postgres real)", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(
    initialCredits = 0,
    initialPlan = "STARTER"
  ) {
    const user = await db.user.create({
      data: {
        id: `user_webhook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits: initialCredits,
        subscriptionCredits: 0,
        oneTimeCredits: initialCredits,
        stripeCustomerId: `cus_webhook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        plan: initialPlan,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    // Cascade delete users and all associated records
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  describe("Checkout Session Completed - Real Price IDs", () => {
    it("deve atribuir 150 créditos ao usuário quando checkout de Starter mensal é processado", async () => {
      const user = await createTestUser(10, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      const result = await checkoutUseCase.execute({
        stripeCustomerId: user.stripeCustomerId!,
        stripeSubscriptionId: `sub_starter_monthly_${Date.now()}`,
        stripePriceId: env.STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("STARTER");
      expect(result.subscriptionCredits).toBe(150);
      expect(result.oneTimeCredits).toBe(10);
      expect(result.totalCredits).toBe(160);

      // Verificar no banco de dados
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.plan).toBe("STARTER");
      expect(updatedUser?.subscriptionCredits).toBe(150);

      // Verificar que a assinatura foi criada
      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
      });
      expect(subscription?.plan).toBe("STARTER");
      expect(subscription?.monthlyCredits).toBe(150);
      expect(subscription?.status).toBe("active");

      // Verificar transação de crédito foi registrada
      const transaction = await db.creditTransaction.findFirst({
        where: { userId: user.id, type: "SUBSCRIPTION_RENEWAL" },
      });
      expect(transaction?.amount).toBe(150);
    });

    it("deve atribuir 1800 créditos ao usuário quando checkout de Starter anual é processado", async () => {
      const user = await createTestUser(5, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      const result = await checkoutUseCase.execute({
        stripeCustomerId: user.stripeCustomerId!,
        stripeSubscriptionId: `sub_starter_annual_${Date.now()}`,
        stripePriceId: env.STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("STARTER");
      expect(result.subscriptionCredits).toBe(1800);
      expect(result.oneTimeCredits).toBe(5);
      expect(result.totalCredits).toBe(1805);

      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.plan).toBe("STARTER");
      expect(updatedUser?.subscriptionCredits).toBe(1800);

      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
      });
      expect(subscription?.plan).toBe("STARTER");
      expect(subscription?.monthlyCredits).toBe(1800);
    });

    it("deve atribuir 300 créditos ao usuário quando checkout de Pro mensal é processado", async () => {
      const user = await createTestUser(0, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      const result = await checkoutUseCase.execute({
        stripeCustomerId: user.stripeCustomerId!,
        stripeSubscriptionId: `sub_pro_monthly_${Date.now()}`,
        stripePriceId: env.STRIPE_PRICE_ID_PLAN_PRO_MONTHLY,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("PRO");
      expect(result.subscriptionCredits).toBe(300);
      expect(result.totalCredits).toBe(300);

      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.plan).toBe("PRO");
      expect(updatedUser?.subscriptionCredits).toBe(300);

      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
      });
      expect(subscription?.plan).toBe("PRO");
      expect(subscription?.monthlyCredits).toBe(300);
    });

    it("deve atribuir 3600 créditos ao usuário quando checkout de Pro anual é processado", async () => {
      const user = await createTestUser(25, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      const result = await checkoutUseCase.execute({
        stripeCustomerId: user.stripeCustomerId!,
        stripeSubscriptionId: `sub_pro_annual_${Date.now()}`,
        stripePriceId: env.STRIPE_PRICE_ID_PLAN_PRO_ANNUAL,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("PRO");
      expect(result.subscriptionCredits).toBe(3600);
      expect(result.oneTimeCredits).toBe(25);
      expect(result.totalCredits).toBe(3625);

      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.plan).toBe("PRO");
      expect(updatedUser?.subscriptionCredits).toBe(3600);

      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
      });
      expect(subscription?.plan).toBe("PRO");
      expect(subscription?.monthlyCredits).toBe(3600);
    });
  });

  describe("Error Handling - Unknown and Deprecated Price IDs", () => {
    it("deve lançar erro quando price ID é totalmente desconhecido", async () => {
      const user = await createTestUser(10, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      await expect(
        checkoutUseCase.execute({
          stripeCustomerId: user.stripeCustomerId!,
          stripeSubscriptionId: `sub_unknown_${Date.now()}`,
          stripePriceId: "price_unknown_injected_xyz",
          creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
          proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
        })
      ).rejects.toThrow();

      // Verificar que nenhuma assinatura foi criada
      const subscriptions = await db.subscription.findMany({
        where: { userId: user.id },
      });
      expect(subscriptions).toHaveLength(0);

      // Verificar que nenhuma transação foi criada
      const transactions = await db.creditTransaction.findMany({
        where: { userId: user.id },
      });
      expect(transactions).toHaveLength(0);
    });

    it("deve lançar erro quando price ID é de crédito avulso (descontinuado)", async () => {
      const user = await createTestUser(10, "STARTER");
      const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();

      // Tentar usar price ID de pacote pequeno (descontinuado)
      await expect(
        checkoutUseCase.execute({
          stripeCustomerId: user.stripeCustomerId!,
          stripeSubscriptionId: `sub_pack_${Date.now()}`,
          stripePriceId: env.STRIPE_SMALL_CREDIT_PACK,
          creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
          proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
        })
      ).rejects.toThrow();

      const subscriptions = await db.subscription.findMany({
        where: { userId: user.id },
      });
      expect(subscriptions).toHaveLength(0);
    });
  });

  describe("Invoice Payment Succeeded - Renewal", () => {
    it("deve renovar créditos Pro quando fatura de renovação Pro anual é processada", async () => {
      const user = await createTestUser(0, "PRO");

      // Criar uma assinatura Pro anual existente
      const existingSubscription = await db.subscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: `sub_existing_pro_annual_${Date.now()}`,
          stripePriceId: env.STRIPE_PRICE_ID_PLAN_PRO_ANNUAL,
          plan: "PRO",
          monthlyCredits: 3600,
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });

      const renewalUseCase = makeProcessSubscriptionRenewalUseCase();
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const result = await renewalUseCase.execute({
        stripeCustomerId: user.stripeCustomerId!,
        stripeSubscriptionId: existingSubscription.stripeSubscriptionId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionCredits).toBe(3600);

      // Verificar que a assinatura foi atualizada
      const updatedSubscription = await db.subscription.findUnique({
        where: { id: existingSubscription.id },
      });
      expect(updatedSubscription?.currentPeriodStart).toEqual(periodStart);
      expect(updatedSubscription?.currentPeriodEnd).toEqual(periodEnd);

      // Verificar que créditos foram renovados
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.subscriptionCredits).toBe(3600);
    });
  });
});
