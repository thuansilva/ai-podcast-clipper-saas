import { NotFoundError } from "~/domain/errors/not-found-error";
import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export interface ProcessSubscriptionRenewalInput {
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan?: string;
  monthlyCredits?: number;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export interface ProcessSubscriptionRenewalOutput {
  success: boolean;
  userId: string;
  subscriptionCredits: number;
  oneTimeCredits: number;
  totalCredits: number;
}

export class ProcessSubscriptionRenewalUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly subscriptionRepository?: ISubscriptionRepository
  ) {}

  async execute(
    input: ProcessSubscriptionRenewalInput
  ): Promise<ProcessSubscriptionRenewalOutput> {
    let userRecord = null;

    if (input.userId) {
      userRecord = await this.userRepository.findById(input.userId);
    } else if (input.stripeCustomerId) {
      userRecord = await this.userRepository.findByStripeCustomerId(
        input.stripeCustomerId
      );
    } else if (input.stripeSubscriptionId && this.subscriptionRepository) {
      const sub =
        await this.subscriptionRepository.findByStripeSubscriptionId(
          input.stripeSubscriptionId
        );
      if (sub) {
        userRecord = await this.userRepository.findById(sub.userId);
      }
    }

    if (!userRecord) {
      throw new NotFoundError(
        "Usuário para renovação de assinatura",
        input.userId ??
          input.stripeCustomerId ??
          input.stripeSubscriptionId ??
          "desconhecido"
      );
    }

    let subRecord = null;
    if (this.subscriptionRepository) {
      if (input.stripeSubscriptionId) {
        subRecord =
          await this.subscriptionRepository.findByStripeSubscriptionId(
            input.stripeSubscriptionId
          );
      } else {
        subRecord = await this.subscriptionRepository.findByUserId(
          userRecord.id
        );
      }
    }

    let monthlyCredits = input.monthlyCredits;
    const plan = input.plan ?? subRecord?.plan ?? userRecord.plan;

    if (monthlyCredits === undefined) {
      if (subRecord?.monthlyCredits) {
        monthlyCredits = subRecord.monthlyCredits;
      } else {
        const upperPlan = plan?.toUpperCase();
        if (upperPlan === "PRO_STUDIO" || upperPlan === "STUDIO") {
          monthlyCredits = 500;
        } else {
          monthlyCredits = 150;
        }
      }
    }

    const user = User.restore(userRecord);
    user.resetSubscriptionCredits(monthlyCredits);
    if (plan) {
      user.upgradePlan(plan);
    }

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(user.id, {
        subscriptionCreditsSet: user.subscriptionCredits,
        creditsSet: user.credits,
      });

      if (user.plan !== userRecord.plan) {
        await this.userRepository.update(user.id, { plan: user.plan });
      }

      await this.creditTransactionRepository.create({
        userId: user.id,
        amount: monthlyCredits,
        type: "SUBSCRIPTION_RENEWAL",
        description: `Renovação de assinatura mensal: cota de ${monthlyCredits} créditos renovada para o plano ${user.plan}`,
      });

      const activeSubId =
        input.stripeSubscriptionId ?? subRecord?.stripeSubscriptionId;
      if (this.subscriptionRepository && activeSubId) {
        await this.subscriptionRepository.update(activeSubId, {
          status: "active",
          ...(input.currentPeriodStart && {
            currentPeriodStart: input.currentPeriodStart,
          }),
          ...(input.currentPeriodEnd && {
            currentPeriodEnd: input.currentPeriodEnd,
          }),
          plan: user.plan,
          monthlyCredits,
        });
      }
    });

    return {
      success: true,
      userId: user.id,
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
      totalCredits: user.credits,
    };
  }
}
