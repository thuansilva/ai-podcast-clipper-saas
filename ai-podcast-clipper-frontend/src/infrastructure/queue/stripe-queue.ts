import { inngest } from "~/inngest/client";
import {
  makeAddCreditsFromStripeWebhookUseCase,
  makeProcessSubscriptionCheckoutUseCase,
  makeProcessSubscriptionRenewalUseCase,
  makeExpireSubscriptionUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { PrismaSubscriptionRepository } from "~/infrastructure/database/repositories/prisma-subscription.repository";
import { env } from "~/env";

export interface StripeCheckoutPayload {
  customerId: string;
  priceId: string;
}

export interface StripeSubscriptionPayload {
  eventType:
    | "checkout.session.completed"
    | "invoice.payment_succeeded"
    | "customer.subscription.updated"
    | "customer.subscription.deleted";
  customerId: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  billingReason?: string;
}

export class StripeBackgroundQueue {
  private checkoutQueue: StripeCheckoutPayload[] = [];
  private subscriptionQueue: StripeSubscriptionPayload[] = [];
  private activeWorkers = 0;
  private readonly maxConcurrency = 10;

  async enqueue(payload: StripeCheckoutPayload): Promise<void> {
    // 1. Try sending to Inngest if Inngest Cloud or dev server is configured
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "stripe/checkout.completed",
          data: payload,
        });
        return;
      } catch (err) {
        console.warn(
          "Failed to dispatch to Inngest Cloud, falling back to in-process queue:",
          err
        );
      }
    }

    // 2. In-process queue with concurrency limit
    this.checkoutQueue.push(payload);
    this.processNext();
  }

  async enqueueSubscription(payload: StripeSubscriptionPayload): Promise<void> {
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "stripe/subscription.event",
          data: {
            ...payload,
            currentPeriodStart: payload.currentPeriodStart?.toISOString(),
            currentPeriodEnd: payload.currentPeriodEnd?.toISOString(),
          },
        });
        return;
      } catch (err) {
        console.warn(
          "Failed to dispatch to Inngest Cloud, falling back to in-process queue:",
          err
        );
      }
    }

    this.subscriptionQueue.push(payload);
    this.processNextSubscription();
  }

  private processNext(): void {
    if (
      this.activeWorkers >= this.maxConcurrency ||
      this.checkoutQueue.length === 0
    ) {
      return;
    }

    const payload = this.checkoutQueue.shift();
    if (!payload) return;

    this.activeWorkers++;

    setImmediate(() => {
      void (async () => {
        try {
          const useCase = makeAddCreditsFromStripeWebhookUseCase();
          await useCase.execute({
            stripeCustomerId: payload.customerId,
            priceId: payload.priceId,
            smallPackPriceId: env.STRIPE_SMALL_CREDIT_PACK,
            mediumPackPriceId: env.STRIPE_MEDIUM_CREDIT_PACK,
            largePackPriceId: env.STRIPE_LARGE_CREDIT_PACK,
          });
        } catch (err) {
          console.error(
            `Error processing Stripe checkout for customer ${payload.customerId}:`,
            err
          );
        } finally {
          this.activeWorkers--;
          this.processNext();
        }
      })();
    });
  }

  private processNextSubscription(): void {
    if (
      this.activeWorkers >= this.maxConcurrency ||
      this.subscriptionQueue.length === 0
    ) {
      return;
    }

    const payload = this.subscriptionQueue.shift();
    if (!payload) return;

    this.activeWorkers++;

    setImmediate(() => {
      void (async () => {
        try {
          if (
            payload.eventType === "checkout.session.completed" &&
            payload.subscriptionId &&
            payload.priceId
          ) {
            const checkoutUseCase = makeProcessSubscriptionCheckoutUseCase();
            await checkoutUseCase.execute({
              stripeCustomerId: payload.customerId,
              stripeSubscriptionId: payload.subscriptionId,
              stripePriceId: payload.priceId,
              creatorPriceId: env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
              proStudioPriceId: env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
              currentPeriodStart: payload.currentPeriodStart,
              currentPeriodEnd: payload.currentPeriodEnd,
            });
          } else if (payload.eventType === "invoice.payment_succeeded") {
            if (payload.billingReason !== "subscription_create") {
              const renewalUseCase = makeProcessSubscriptionRenewalUseCase();
              await renewalUseCase.execute({
                stripeCustomerId: payload.customerId,
                stripeSubscriptionId: payload.subscriptionId,
                currentPeriodStart: payload.currentPeriodStart,
                currentPeriodEnd: payload.currentPeriodEnd,
              });
            }
          } else if (payload.eventType === "customer.subscription.deleted") {
            const expireUseCase = makeExpireSubscriptionUseCase();
            await expireUseCase.execute({
              stripeCustomerId: payload.customerId,
              stripeSubscriptionId: payload.subscriptionId,
            });
          } else if (payload.eventType === "customer.subscription.updated") {
            if (payload.subscriptionId) {
              const subRepo = new PrismaSubscriptionRepository();
              await subRepo.update(payload.subscriptionId, {
                ...(payload.status && { status: payload.status }),
                ...(payload.cancelAtPeriodEnd !== undefined && {
                  cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
                }),
              });
            }
          }
        } catch (err) {
          console.error(
            `Error processing Stripe subscription event ${payload.eventType} for customer ${payload.customerId}:`,
            err
          );
        } finally {
          this.activeWorkers--;
          this.processNextSubscription();
        }
      })();
    });
  }

  getPendingCount(): number {
    return (
      this.checkoutQueue.length +
      this.subscriptionQueue.length +
      this.activeWorkers
    );
  }
}

export const stripeBackgroundQueue = new StripeBackgroundQueue();

export function dispatchStripeCheckoutEvent(
  payload: StripeCheckoutPayload
): void {
  void stripeBackgroundQueue.enqueue(payload);
}

export function dispatchStripeSubscriptionEvent(
  payload: StripeSubscriptionPayload
): void {
  void stripeBackgroundQueue.enqueueSubscription(payload);
}
