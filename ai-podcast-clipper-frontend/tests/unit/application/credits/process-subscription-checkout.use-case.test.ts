import { describe, it, expect, beforeEach } from "vitest";
import { ProcessSubscriptionCheckoutUseCase } from "~/application/use-cases/credits/process-subscription-checkout.use-case";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryCreditTransactionRepository } from "../../../mocks/in-memory-credit-transaction-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { env } from "~/env";

describe("ProcessSubscriptionCheckoutUseCase", () => {
  let userRepo: InMemoryUserRepository;
  let subRepo: InMemorySubscriptionRepository;
  let txRepo: InMemoryCreditTransactionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ProcessSubscriptionCheckoutUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subRepo = new InMemorySubscriptionRepository();
    txRepo = new InMemoryCreditTransactionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ProcessSubscriptionCheckoutUseCase(
      userRepo,
      subRepo,
      txRepo,
      uow
    );
  });

  describe("Plans with Real Stripe Price IDs from env.js", () => {
    it("deve ativar plano Starter mensal com 150 créditos quando receber STRIPE_STARTER_MONTHLY_PRICE_ID", async () => {
      const userId = "user_starter_monthly_1";
      const stripeCusId = "cus_starter_monthly_1";

      await userRepo.create({
        id: userId,
        email: "starter_monthly@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 10,
        credits: 10,
        plan: "STARTER",
      });

      const result = await useCase.execute({
        stripeCustomerId: stripeCusId,
        stripeSubscriptionId: "sub_starter_monthly_1",
        stripePriceId: env.STRIPE_STARTER_MONTHLY_PRICE_ID,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("STARTER");
      expect(result.subscriptionCredits).toBe(150);
      expect(result.oneTimeCredits).toBe(10);
      expect(result.totalCredits).toBe(160);

      const sub = await subRepo.findByStripeSubscriptionId(
        "sub_starter_monthly_1"
      );
      expect(sub?.status).toBe("active");
      expect(sub?.monthlyCredits).toBe(150);
      expect(sub?.plan).toBe("STARTER");

      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(1);
      expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
      expect(txs[0]?.amount).toBe(150);
    });

    it("deve ativar plano Starter anual com 1800 créditos (lump sum) quando receber STRIPE_STARTER_ANNUAL_PRICE_ID", async () => {
      const userId = "user_starter_annual_1";
      const stripeCusId = "cus_starter_annual_1";

      await userRepo.create({
        id: userId,
        email: "starter_annual@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 5,
        credits: 5,
        plan: "STARTER",
      });

      const result = await useCase.execute({
        stripeCustomerId: stripeCusId,
        stripeSubscriptionId: "sub_starter_annual_1",
        stripePriceId: env.STRIPE_STARTER_ANNUAL_PRICE_ID,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("STARTER");
      expect(result.subscriptionCredits).toBe(1800);
      expect(result.oneTimeCredits).toBe(5);
      expect(result.totalCredits).toBe(1805);

      const sub = await subRepo.findByStripeSubscriptionId(
        "sub_starter_annual_1"
      );
      expect(sub?.status).toBe("active");
      expect(sub?.monthlyCredits).toBe(1800);
      expect(sub?.plan).toBe("STARTER");

      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(1);
      expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
      expect(txs[0]?.amount).toBe(1800);
    });

    it("deve ativar plano Pro mensal com 300 créditos quando receber STRIPE_PRO_MONTHLY_PRICE_ID", async () => {
      const userId = "user_pro_monthly_1";
      const stripeCusId = "cus_pro_monthly_1";

      await userRepo.create({
        id: userId,
        email: "pro_monthly@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 15,
        credits: 15,
        plan: "STARTER",
      });

      const result = await useCase.execute({
        stripeCustomerId: stripeCusId,
        stripeSubscriptionId: "sub_pro_monthly_1",
        stripePriceId: env.STRIPE_PRO_MONTHLY_PRICE_ID,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("PRO");
      expect(result.subscriptionCredits).toBe(300);
      expect(result.oneTimeCredits).toBe(15);
      expect(result.totalCredits).toBe(315);

      const sub = await subRepo.findByStripeSubscriptionId(
        "sub_pro_monthly_1"
      );
      expect(sub?.status).toBe("active");
      expect(sub?.monthlyCredits).toBe(300);
      expect(sub?.plan).toBe("PRO");

      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(1);
      expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
      expect(txs[0]?.amount).toBe(300);
    });

    it("deve ativar plano Pro anual com 3600 créditos (lump sum) quando receber STRIPE_PRO_ANNUAL_PRICE_ID", async () => {
      const userId = "user_pro_annual_1";
      const stripeCusId = "cus_pro_annual_1";

      await userRepo.create({
        id: userId,
        email: "pro_annual@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 20,
        credits: 20,
        plan: "STARTER",
      });

      const result = await useCase.execute({
        stripeCustomerId: stripeCusId,
        stripeSubscriptionId: "sub_pro_annual_1",
        stripePriceId: env.STRIPE_PRO_ANNUAL_PRICE_ID,
        creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
        proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBe("PRO");
      expect(result.subscriptionCredits).toBe(3600);
      expect(result.oneTimeCredits).toBe(20);
      expect(result.totalCredits).toBe(3620);

      const sub = await subRepo.findByStripeSubscriptionId(
        "sub_pro_annual_1"
      );
      expect(sub?.status).toBe("active");
      expect(sub?.monthlyCredits).toBe(3600);
      expect(sub?.plan).toBe("PRO");

      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(1);
      expect(txs[0]?.type).toBe("SUBSCRIPTION_RENEWAL");
      expect(txs[0]?.amount).toBe(3600);
    });
  });

  describe("Error Handling for Invalid Price IDs", () => {
    it("deve lançar erro explícito quando receber um price ID desconhecido (não um dos 4 reais)", async () => {
      const userId = "user_unknown_price";
      const stripeCusId = "cus_unknown_price";

      await userRepo.create({
        id: userId,
        email: "unknown_price@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 10,
        credits: 10,
        plan: "STARTER",
      });

      // Price ID totalmente desconhecido (nem um dos 4, nem um pacote avulso)
      await expect(
        useCase.execute({
          stripeCustomerId: stripeCusId,
          stripeSubscriptionId: "sub_unknown_1",
          stripePriceId: "price_unknown_injected_123",
          creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
          proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
        })
      ).rejects.toThrow();

      // Verificar que nenhuma transação foi criada
      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(0);
    });

    it("deve lançar NotFoundError se cliente Stripe não for encontrado", async () => {
      await expect(
        useCase.execute({
          stripeCustomerId: "cus_unknown",
          stripeSubscriptionId: "sub_3",
          stripePriceId: env.STRIPE_STARTER_MONTHLY_PRICE_ID,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("deve rejeitar price IDs de créditos avulsos (credit packs) que não devem mais ser usados", async () => {
      const userId = "user_old_pack";
      const stripeCusId = "cus_old_pack";

      await userRepo.create({
        id: userId,
        email: "old_pack@test.com",
        stripeCustomerId: stripeCusId,
        subscriptionCredits: 0,
        oneTimeCredits: 10,
        credits: 10,
        plan: "STARTER",
      });

      // O pequeno pacote (price_small) foi descontinuado
      // O use case não deve mais reconhecê-lo no fluxo de assinatura
      await expect(
        useCase.execute({
          stripeCustomerId: stripeCusId,
          stripeSubscriptionId: "sub_old_pack_1",
          stripePriceId: env.STRIPE_SMALL_CREDIT_PACK,
          creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
          proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
        })
      ).rejects.toThrow();

      // Verificar que nenhuma transação foi criada
      const txs = await txRepo.findByUserId(userId);
      expect(txs).toHaveLength(0);
    });
  });

});
