import Stripe from "stripe";
import { env } from "~/env";
import type {
  CreateCheckoutSessionInput,
  IPaymentGateway,
} from "~/domain/ports/payment-gateway";

export class StripePaymentGateway implements IPaymentGateway {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-04-30.basil",
    });
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer: input.customerId,
      mode: "payment",
      success_url: input.successUrl,
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe checkout session URL");
    }

    return session.url;
  }
}
