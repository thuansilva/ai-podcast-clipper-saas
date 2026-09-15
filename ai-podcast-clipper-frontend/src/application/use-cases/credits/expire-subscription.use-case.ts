import { NotFoundError } from "~/domain/errors/not-found-error";
import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export interface ExpireSubscriptionInput {
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface ExpireSubscriptionOutput {
  success: boolean;
  userId: string;
  plan: string;
  subscriptionCredits: number;
  oneTimeCredits: number;
  totalCredits: number;
}

export class ExpireSubscriptionUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly subscriptionRepository?: ISubscriptionRepository
  ) {}

  async execute(
    input: ExpireSubscriptionInput
  ): Promise<ExpireSubscriptionOutput> {
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
        "Usuário para expiração de assinatura",
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

    const user = User.restore(userRecord);
    user.expireSubscription();

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(user.id, {
        subscriptionCreditsSet: 0,
        creditsSet: user.credits,
      });

      await this.userRepository.update(user.id, { plan: "STARTER" });

      const activeSubId =
        input.stripeSubscriptionId ?? subRecord?.stripeSubscriptionId;
      if (this.subscriptionRepository && activeSubId) {
        await this.subscriptionRepository.update(activeSubId, {
          status: "canceled",
        });
      }
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
