import { inngest } from "~/inngest/client";
import { makeAddCreditsFromStripeWebhookUseCase } from "~/infrastructure/factories/use-case-factories";
import { env } from "~/env";

export interface StripeCheckoutPayload {
  customerId: string;
  priceId: string;
}

export class StripeBackgroundQueue {
  private queue: StripeCheckoutPayload[] = [];
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
        console.warn("Failed to dispatch to Inngest Cloud, falling back to in-process queue:", err);
      }
    }

    // 2. In-process queue with concurrency limit
    this.queue.push(payload);
    this.processNext();
  }

  private processNext(): void {
    if (this.activeWorkers >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const payload = this.queue.shift();
    if (!payload) return;

    this.activeWorkers++;

    // Execute in background event loop tick
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
            err,
          );
        } finally {
          this.activeWorkers--;
          this.processNext();
        }
      })();
    });
  }

  getPendingCount(): number {
    return this.queue.length + this.activeWorkers;
  }
}

export const stripeBackgroundQueue = new StripeBackgroundQueue();

export function dispatchStripeCheckoutEvent(payload: StripeCheckoutPayload): void {
  void stripeBackgroundQueue.enqueue(payload);
}
