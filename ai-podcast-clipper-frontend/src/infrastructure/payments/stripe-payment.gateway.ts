import Stripe from "stripe";
import { env } from "~/env";
import type {
  CreateBillingPortalSessionInput,
  CreateCheckoutSessionInput,
  IPaymentGateway,
} from "~/domain/ports/payment-gateway";

export class StripePaymentGateway implements IPaymentGateway {
  private readonly stripe: Stripe;

  constructor(stripeInstance?: Stripe) {
    this.stripe =
      stripeInstance ??
      new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-04-30.basil",
      });
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer: input.customerId,
      mode: input.mode ?? "payment",
      success_url: input.successUrl,
      ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe checkout session URL");
    }

    return session.url;
  }

  async createBillingPortalSession(
    input: CreateBillingPortalSessionInput
  ): Promise<string>;
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<string>;
  async createBillingPortalSession(
    inputOrCustomerId: CreateBillingPortalSessionInput | string,
    maybeReturnUrl?: string
  ): Promise<string> {
    const customerId =
      typeof inputOrCustomerId === "string"
        ? inputOrCustomerId
        : inputOrCustomerId.customerId;
    const returnUrl =
      typeof inputOrCustomerId === "string"
        ? maybeReturnUrl!
        : inputOrCustomerId.returnUrl;

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe billing portal session URL");
    }

    return session.url;
  }

  async createCustomer(email: string, name?: string | null): Promise<string> {
    if (
      env.STRIPE_SECRET_KEY.includes("dummy") ||
      env.STRIPE_SECRET_KEY.includes("mock")
    ) {
      console.warn(
        `[StripePaymentGateway] STRIPE_SECRET_KEY é dummy/mock. Gerando stripeCustomerId local para ${email}.`,
      );
      return `cus_dev_${Date.now()}`;
    }

    try {
      const customer = await this.stripe.customers.create({
        email: email.toLowerCase(),
        name: name ?? undefined,
      });
      return customer.id;
    } catch (error) {
      console.warn(
        `[StripePaymentGateway] Erro ao criar cliente no Stripe (${
          error instanceof Error ? error.message : "Erro desconhecido"
        }). Usando fallback de desenvolvimento.`,
      );
      return `cus_fallback_${Date.now()}`;
    }
  }
}
