import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "~/env";
import { makeAddCreditsFromStripeWebhookUseCase } from "~/infrastructure/factories/use-case-factories";
import { DomainError } from "~/domain/errors/domain-error";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      console.error("Webhook signature verification failed", error);
      return new NextResponse("Webhook signature verification failed", {
        status: 400,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;

      let lineItems = session.line_items;

      if (!lineItems || !lineItems.data || lineItems.data.length === 0) {
        try {
          const retrievedSession = await stripe.checkout.sessions.retrieve(
            session.id,
            { expand: ["line_items"] },
          );
          lineItems = retrievedSession.line_items;
        } catch (err) {
          console.warn("Could not retrieve line items from Stripe API:", err);
        }
      }

      if (lineItems && lineItems.data && lineItems.data.length > 0) {
        const priceId = lineItems.data[0]?.price?.id ?? undefined;

        if (priceId && customerId) {
          try {
            const useCase = makeAddCreditsFromStripeWebhookUseCase();
            await useCase.execute({
              stripeCustomerId: customerId,
              priceId,
              smallPackPriceId: env.STRIPE_SMALL_CREDIT_PACK,
              mediumPackPriceId: env.STRIPE_MEDIUM_CREDIT_PACK,
              largePackPriceId: env.STRIPE_LARGE_CREDIT_PACK,
            });
          } catch (err) {
            if (err instanceof DomainError) {
              return new NextResponse(err.message, { status: 404 });
            }
            throw err;
          }
        }
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new NextResponse("Webhook error", { status: 500 });
  }
}
