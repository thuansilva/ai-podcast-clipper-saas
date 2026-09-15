import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "~/env";
import {
  dispatchStripeCheckoutEvent,
  dispatchStripeSubscriptionEvent,
} from "~/infrastructure/queue/stripe-queue";

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
      const session = event.data.object;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? "";

      let lineItems = session.line_items;

      if (!lineItems?.data || lineItems.data.length === 0) {
        try {
          const retrievedSession = await stripe.checkout.sessions.retrieve(
            session.id,
            { expand: ["line_items"] }
          );
          lineItems = retrievedSession.line_items;
        } catch (err) {
          console.warn("Could not retrieve line items from Stripe API:", err);
        }
      }

      const priceId = lineItems?.data?.[0]?.price?.id ?? undefined;

      if (session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (customerId) {
          dispatchStripeSubscriptionEvent({
            eventType: "checkout.session.completed",
            customerId,
            subscriptionId,
            priceId,
          });
        }
      } else {
        if (priceId && customerId) {
          dispatchStripeCheckoutEvent({
            customerId,
            priceId,
          });
        }
      }
    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as unknown as {
        customer?: string | { id: string } | null;
        subscription?: string | { id: string } | null;
        parent?: {
          subscription_details?: {
            subscription?: string | { id: string } | null;
          } | null;
        } | null;
        lines?: {
          data?: Array<{
            price?: { id?: string } | null;
            pricing?: { price_details?: { price?: string } } | null;
            period?: { start?: number; end?: number } | null;
          }>;
        };
      };

      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? "";

      const rawSub =
        invoice.subscription ??
        invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof rawSub === "string" ? rawSub : rawSub?.id;

      const lineItem = invoice.lines?.data?.[0];
      const priceId =
        lineItem?.price?.id ?? lineItem?.pricing?.price_details?.price;
      const periodStart = lineItem?.period?.start
        ? new Date(lineItem.period.start * 1000)
        : undefined;
      const periodEnd = lineItem?.period?.end
        ? new Date(lineItem.period.end * 1000)
        : undefined;
      const billingReason = (invoice as { billing_reason?: string }).billing_reason;

      if (customerId) {
        dispatchStripeSubscriptionEvent({
          eventType: "invoice.payment_succeeded",
          customerId,
          subscriptionId,
          priceId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          billingReason,
        });
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? "";
      const subscriptionId = subscription.id;
      const status = subscription.status;
      const cancelAtPeriodEnd = subscription.cancel_at_period_end;

      if (customerId && subscriptionId) {
        dispatchStripeSubscriptionEvent({
          eventType: "customer.subscription.updated",
          customerId,
          subscriptionId,
          status,
          cancelAtPeriodEnd,
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? "";
      const subscriptionId = subscription.id;

      if (customerId && subscriptionId) {
        dispatchStripeSubscriptionEvent({
          eventType: "customer.subscription.deleted",
          customerId,
          subscriptionId,
        });
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new NextResponse("Webhook error", { status: 500 });
  }
}
