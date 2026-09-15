export interface SubscriptionEntity {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  plan: string;
  monthlyCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSubscriptionData {
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  plan: string;
  monthlyCredits: number;
}

export interface UpdateSubscriptionData {
  status?: string;
  stripePriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  plan?: string;
  monthlyCredits?: number;
}

export interface ISubscriptionRepository {
  findByUserId(userId: string): Promise<SubscriptionEntity | null>;
  findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionEntity | null>;
  upsert(data: UpsertSubscriptionData): Promise<SubscriptionEntity>;
  update(
    stripeSubscriptionId: string,
    data: UpdateSubscriptionData
  ): Promise<SubscriptionEntity>;
}
