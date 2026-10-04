import { NotFoundError } from "~/domain/errors/not-found-error";
import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import { PlanCatalogService } from "~/application/services/plan-catalog.service";

export interface ProcessSubscriptionCheckoutInput {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  /**
   * @deprecated Taxonomia legada (plano "CREATOR"/"PRO_STUDIO"). Não é mais
   * usada para resolver plano/créditos — o `PlanCatalogService` resolve
   * isso a partir de `stripePriceId` sozinho, usando os 4 price IDs reais
   * declarados em `src/env.js`. Mantido apenas por compatibilidade de
   * assinatura com chamadores legados; qualquer valor passado aqui é
   * ignorado.
   */
  creatorPriceId?: string;
  /** @deprecated Ver `creatorPriceId`. */
  proStudioPriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export interface ProcessSubscriptionCheckoutOutput {
  success: boolean;
  userId: string;
  plan: string;
  subscriptionCredits: number;
  oneTimeCredits: number;
  totalCredits: number;
}

export class ProcessSubscriptionCheckoutUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: ProcessSubscriptionCheckoutInput
  ): Promise<ProcessSubscriptionCheckoutOutput> {
    const userRecord = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!userRecord) {
      throw new NotFoundError(
        "Usuário com Stripe Customer ID",
        input.stripeCustomerId
      );
    }

    const { plan, credits: monthlyCredits } = PlanCatalogService.resolveByPriceId(
      input.stripePriceId
    );

    const user = User.restore(userRecord);
    user.resetSubscriptionCredits(monthlyCredits);
    user.upgradePlan(plan);

    const periodStart = input.currentPeriodStart ?? new Date();
    const periodEnd =
      input.currentPeriodEnd ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(user.id, {
        subscriptionCreditsSet: user.subscriptionCredits,
        creditsSet: user.credits,
      });

      await this.userRepository.update(user.id, { plan: user.plan });

      await this.subscriptionRepository.upsert({
        userId: user.id,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        plan: user.plan,
        monthlyCredits,
      });

      await this.creditTransactionRepository.create({
        userId: user.id,
        amount: monthlyCredits,
        type: "SUBSCRIPTION_RENEWAL",
        description: `Ativação de assinatura mensal: cota de ${monthlyCredits} créditos para o plano ${user.plan}`,
      });
    });

    return {
      success: true,
      userId: user.id,
      plan: user.plan,
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
      totalCredits: user.credits,
    };
  }
}
