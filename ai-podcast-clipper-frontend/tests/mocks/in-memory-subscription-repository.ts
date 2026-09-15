import type {
  ISubscriptionRepository,
  SubscriptionEntity,
  UpsertSubscriptionData,
  UpdateSubscriptionData,
} from "~/domain/ports/subscription-repository";

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  public subscriptions: Map<string, SubscriptionEntity> = new Map();

  async findByUserId(userId: string): Promise<SubscriptionEntity | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.userId === userId) {
        return sub;
      }
    }
    return null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionEntity | null> {
    return this.subscriptions.get(stripeSubscriptionId) ?? null;
  }

  async upsert(data: UpsertSubscriptionData): Promise<SubscriptionEntity> {
    const existing =
      (await this.findByStripeSubscriptionId(data.stripeSubscriptionId)) ??
      (await this.findByUserId(data.userId));

    const now = new Date();
    const entity: SubscriptionEntity = {
      id: existing?.id ?? `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: data.userId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripePriceId: data.stripePriceId,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      plan: data.plan,
      monthlyCredits: data.monthlyCredits,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.subscriptions.set(entity.stripeSubscriptionId, entity);
    return entity;
  }

  async update(
    stripeSubscriptionId: string,
    data: UpdateSubscriptionData
  ): Promise<SubscriptionEntity> {
    const existing = await this.findByStripeSubscriptionId(stripeSubscriptionId);
    if (!existing) {
      throw new Error(`Subscription ${stripeSubscriptionId} not found`);
    }

    const updated: SubscriptionEntity = {
      ...existing,
      ...(data.status !== undefined && { status: data.status }),
      ...(data.stripePriceId !== undefined && {
        stripePriceId: data.stripePriceId,
      }),
      ...(data.currentPeriodStart !== undefined && {
        currentPeriodStart: data.currentPeriodStart,
      }),
      ...(data.currentPeriodEnd !== undefined && {
        currentPeriodEnd: data.currentPeriodEnd,
      }),
      ...(data.cancelAtPeriodEnd !== undefined && {
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      }),
      ...(data.plan !== undefined && { plan: data.plan }),
      ...(data.monthlyCredits !== undefined && {
        monthlyCredits: data.monthlyCredits,
      }),
      updatedAt: new Date(),
    };

    this.subscriptions.set(stripeSubscriptionId, updated);
    return updated;
  }
}
