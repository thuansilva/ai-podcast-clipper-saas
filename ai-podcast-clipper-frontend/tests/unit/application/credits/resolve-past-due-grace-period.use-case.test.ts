import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResolvePastDueGracePeriodUseCase } from "~/application/use-cases/credits/resolve-past-due-grace-period.use-case";
import type { CreateUserData } from "~/domain/ports/user-repository";
import type { UpsertSubscriptionData } from "~/domain/ports/subscription-repository";
import { InMemoryUserRepository } from "../../../mocks/in-memory-user-repository";
import { InMemorySubscriptionRepository } from "../../../mocks/in-memory-subscription-repository";
import { InMemoryUnitOfWork } from "../../../mocks/in-memory-unit-of-work";

/**
 * Testes de caracterização da regra de carência (past_due) para a reação
 * síncrona a `invoice.payment_succeeded`. Travam o comportamento ATUAL do
 * use case antes de qualquer refatoração (ex.: troca de
 * `!subRecord || subRecord.status !== ...` por `subRecord?.status !== ...`).
 */
describe("ResolvePastDueGracePeriodUseCase", () => {
  const CUSTOMER_ID = "cus_grace_resolve_1";
  const SUBSCRIPTION_ID = "sub_grace_resolve_1";
  const USER_ID = "user_grace_resolve_1";
  const PAST_DUE_SINCE = new Date("2026-10-01T00:00:00.000Z");

  let userRepo: InMemoryUserRepository;
  let subRepo: InMemorySubscriptionRepository;
  let uow: InMemoryUnitOfWork;
  let useCase: ResolvePastDueGracePeriodUseCase;

  async function seedUser(): Promise<void> {
    const userData: CreateUserData = {
      id: USER_ID,
      email: "grace@test.com",
      stripeCustomerId: CUSTOMER_ID,
      subscriptionCredits: 100,
      oneTimeCredits: 20,
      credits: 120,
      plan: "CREATOR",
    };
    await userRepo.create(userData);
  }

  async function seedSubscription(status: string, withPastDueAt: boolean): Promise<void> {
    const subData: UpsertSubscriptionData = {
      userId: USER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: "price_creator_monthly",
      status,
      plan: "CREATOR",
      monthlyCredits: 150,
      currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    };
    await subRepo.upsert(subData);
    if (withPastDueAt) {
      await subRepo.update(SUBSCRIPTION_ID, { pastDueAt: PAST_DUE_SINCE });
    }
  }

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    subRepo = new InMemorySubscriptionRepository();
    uow = new InMemoryUnitOfWork();
    useCase = new ResolvePastDueGracePeriodUseCase(userRepo, subRepo, uow);
  });

  describe("caminho feliz", () => {
    it("deve voltar assinatura past_due para active, zerar pastDueAt e retornar resolved=true (busca por stripeSubscriptionId)", async () => {
      await seedUser();
      await seedSubscription("past_due", true);

      const result = await useCase.execute({
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      });

      expect(result).toEqual({ resolved: true });
      const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
      expect(sub?.status).toBe("active");
      expect(sub?.pastDueAt).toBeNull();
    });

    it("deve resolver a carência buscando a assinatura pelo userId quando stripeSubscriptionId não é informado", async () => {
      await seedUser();
      await seedSubscription("past_due", true);
      const findByUserIdSpy = vi.spyOn(subRepo, "findByUserId");

      const result = await useCase.execute({ stripeCustomerId: CUSTOMER_ID });

      expect(result).toEqual({ resolved: true });
      expect(findByUserIdSpy).toHaveBeenCalledWith(USER_ID);
      const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
      expect(sub?.status).toBe("active");
      expect(sub?.pastDueAt).toBeNull();
    });

    it("não deve tocar em créditos do usuário (responsabilidade do ProcessSubscriptionRenewalUseCase)", async () => {
      await seedUser();
      await seedSubscription("past_due", true);

      await useCase.execute({
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      });

      const user = await userRepo.findById(USER_ID);
      expect(user?.subscriptionCredits).toBe(100);
      expect(user?.oneTimeCredits).toBe(20);
      expect(user?.credits).toBe(120);
    });

    it("deve executar a escrita dentro da unidade de trabalho (unitOfWork.execute)", async () => {
      await seedUser();
      await seedSubscription("past_due", true);
      const uowSpy = vi.spyOn(uow, "execute");

      await useCase.execute({
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      });

      expect(uowSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("validação de regra de negócio (sem efeito, resolved=false)", () => {
    it("deve retornar resolved=false quando o stripeCustomerId não corresponde a nenhum usuário", async () => {
      await seedUser();
      await seedSubscription("past_due", true);
      const updateSpy = vi.spyOn(subRepo, "update");

      const result = await useCase.execute({
        stripeCustomerId: "cus_inexistente",
        stripeSubscriptionId: SUBSCRIPTION_ID,
      });

      expect(result).toEqual({ resolved: false });
      expect(updateSpy).not.toHaveBeenCalled();
      const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
      expect(sub?.status).toBe("past_due");
    });

    it("deve retornar resolved=false sem lançar erro quando stripeSubscriptionId não existe (ramo !subRecord com busca por id)", async () => {
      await seedUser();
      await seedSubscription("past_due", true);
      const updateSpy = vi.spyOn(subRepo, "update");

      const result = await useCase.execute({
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: "sub_inexistente",
      });

      expect(result).toEqual({ resolved: false });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("deve retornar resolved=false sem lançar erro quando o usuário não possui assinatura (ramo !subRecord com busca por userId)", async () => {
      await seedUser();
      const updateSpy = vi.spyOn(subRepo, "update");

      const result = await useCase.execute({ stripeCustomerId: CUSTOMER_ID });

      expect(result).toEqual({ resolved: false });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each(["active", "canceled", "incomplete"])(
      "deve retornar resolved=false e não alterar a assinatura quando o status é '%s' (fora de carência)",
      async (status) => {
        await seedUser();
        await seedSubscription(status, false);
        const updateSpy = vi.spyOn(subRepo, "update");

        const result = await useCase.execute({
          stripeCustomerId: CUSTOMER_ID,
          stripeSubscriptionId: SUBSCRIPTION_ID,
        });

        expect(result).toEqual({ resolved: false });
        expect(updateSpy).not.toHaveBeenCalled();
        const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
        expect(sub?.status).toBe(status);
      }
    );
  });

  describe("casos de borda", () => {
    it("deve ser idempotente: uma segunda chamada após resolver retorna resolved=false e mantém active", async () => {
      await seedUser();
      await seedSubscription("past_due", true);
      const input = {
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      };

      const first = await useCase.execute(input);
      const second = await useCase.execute(input);

      expect(first).toEqual({ resolved: true });
      expect(second).toEqual({ resolved: false });
      const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
      expect(sub?.status).toBe("active");
      expect(sub?.pastDueAt).toBeNull();
    });

    it("deve resolver past_due mesmo quando pastDueAt nunca foi gravado (valor ausente)", async () => {
      await seedUser();
      await seedSubscription("past_due", false);

      const result = await useCase.execute({
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
      });

      expect(result).toEqual({ resolved: true });
      const sub = await subRepo.findByStripeSubscriptionId(SUBSCRIPTION_ID);
      expect(sub?.status).toBe("active");
      expect(sub?.pastDueAt).toBeNull();
    });
  });
});
