import { db } from "~/server/db";
import type {
  ISubscriptionRepository,
  SubscriptionEntity,
  UpsertSubscriptionData,
  UpdateSubscriptionData,
} from "~/domain/ports/subscription-repository";

export class PrismaSubscriptionRepository implements ISubscriptionRepository {
  async findByUserId(userId: string): Promise<SubscriptionEntity | null> {
    const sub = await db.subscription.findUnique({
      where: { userId },
    });

    if (!sub) return null;

    return {
      id: sub.id,
      userId: sub.userId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      plan: sub.plan,
      monthlyCredits: sub.monthlyCredits,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionEntity | null> {
    const sub = await db.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!sub) return null;

    return {
      id: sub.id,
      userId: sub.userId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      plan: sub.plan,
      monthlyCredits: sub.monthlyCredits,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  async upsert(data: UpsertSubscriptionData): Promise<SubscriptionEntity> {
    const sub = await db.subscription.upsert({
      where: { stripeSubscriptionId: data.stripeSubscriptionId },
      create: {
        userId: data.userId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        plan: data.plan,
        monthlyCredits: data.monthlyCredits,
      },
      update: {
        stripePriceId: data.stripePriceId,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        ...(data.cancelAtPeriodEnd !== undefined && {
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        }),
        plan: data.plan,
        monthlyCredits: data.monthlyCredits,
      },
    });

    return {
      id: sub.id,
      userId: sub.userId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      plan: sub.plan,
      monthlyCredits: sub.monthlyCredits,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  async update(
    stripeSubscriptionId: string,
    data: UpdateSubscriptionData
  ): Promise<SubscriptionEntity> {
    const sub = await db.subscription.update({
      where: { stripeSubscriptionId },
      data: {
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
      },
    });

    return {
      id: sub.id,
      userId: sub.userId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      plan: sub.plan,
      monthlyCredits: sub.monthlyCredits,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }
}
