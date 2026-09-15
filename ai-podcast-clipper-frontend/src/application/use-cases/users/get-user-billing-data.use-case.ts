import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";

export interface UserBillingDataOutput {
  credits: number;
  subscriptionCredits: number;
  oneTimeCredits: number;
  plan?: string;
  subscription?: {
    id?: string;
    plan: string;
    status: string;
    monthlyCredits?: number;
    currentPeriodStart?: Date | string;
    currentPeriodEnd?: Date | string;
    cancelAtPeriodEnd?: boolean;
  } | null;
}

export class GetUserBillingDataUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository
  ) {}

  async execute(userId: string): Promise<UserBillingDataOutput | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    const subscription = await this.subscriptionRepository.findByUserId(userId);

    return {
      credits: user.credits,
      subscriptionCredits: user.subscriptionCredits ?? 0,
      oneTimeCredits: user.oneTimeCredits ?? 0,
      plan: user.plan,
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            monthlyCredits: subscription.monthlyCredits,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    };
  }
}
