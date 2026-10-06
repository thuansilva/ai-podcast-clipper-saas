import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "~/env";
import { PrismaProcessedEventRepository } from "~/infrastructure/database/repositories/prisma-processed-event.repository";
import {
  dispatchStripeCheckoutEvent,
  dispatchStripeSubscriptionEvent,
  notifyStripeBillingEvent,
} from "~/infrastructure/queue/stripe-queue";
import {
  makeProcessPaymentFailedUseCase,
  makeProcessChargeRefundUseCase,
  makeProcessChargeDisputeUseCase,
  makeResolvePastDueGracePeriodUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { logger } from "~/lib/observability/logger";
import { withSpan } from "~/lib/observability/tracer";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

const processedEventRepository = new PrismaProcessedEventRepository();

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      logger.error("Stripe webhook signature verification failed", { error });
      return new NextResponse("Webhook signature verification failed", {
        status: 400,
      });
    }

    return await withSpan(
      "stripe.webhook.handle",
      { "stripe.event.type": event.type, "stripe.event.id": event.id },
      () => handleStripeEvent(event)
    );
  } catch (error) {
    logger.error("Error processing Stripe webhook", { error });
    return new NextResponse("Webhook error", { status: 500 });
  }
}

async function handleStripeEvent(event: Stripe.Event): Promise<NextResponse> {
  // Checagem de idempotência (curto-circuito): se esse event.id já foi
  // processado com sucesso antes, ignora o retry sem redisparar nada.
  const alreadyProcessed = await processedEventRepository.isProcessed(
    event.id
  );
  if (alreadyProcessed) {
    logger.info("Stripe webhook event already processed, skipping", {
      "stripe.event.id": event.id,
      "stripe.event.type": event.type,
    });
    return new NextResponse(null, { status: 200 });
  }

  try {
    await dispatchStripeEventForProcessing(event);
  } catch (error) {
    // IMPORTANTE: o evento NÃO é marcado como processado aqui. Se o
    // dispatch pro Inngest falhar, respondemos 5xx de propósito pra que o
    // Stripe reentregue o webhook depois — marcar como processado antes
    // de confirmar o dispatch é exatamente o bug que causava perda
    // silenciosa e irrecuperável de crédito pago.
    logger.error(
      "Failed to dispatch Stripe webhook event for background processing",
      {
        error,
        "stripe.event.id": event.id,
        "stripe.event.type": event.type,
      }
    );
    return new NextResponse("Failed to dispatch event for processing", {
      status: 503,
    });
  }

  // Só marca como processado DEPOIS de confirmar que o dispatch (ou a
  // ausência de dispatch, para tipos de evento não tratados) foi
  // concluído com sucesso.
  await processedEventRepository.tryMarkProcessed(event.id, event.type);

  return new NextResponse(null, { status: 200 });
}

async function dispatchStripeEventForProcessing(
  event: Stripe.Event
): Promise<void> {
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
          logger.warn("Could not retrieve line items from Stripe API", {
            error: err,
          });
        }
      }

      const priceId = lineItems?.data?.[0]?.price?.id ?? undefined;

      if (session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (customerId) {
          await dispatchStripeSubscriptionEvent(
            {
              eventType: "checkout.session.completed",
              customerId,
              subscriptionId,
              priceId,
            },
            event.id
          );
        }
      } else {
        if (priceId && customerId) {
          await dispatchStripeCheckoutEvent(
            {
              customerId,
              priceId,
            },
            event.id
          );
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
        // Reação síncrona e imediata (best-effort, nunca lança): se a
        // assinatura estava em carência ("past_due") por um
        // `invoice.payment_failed` anterior, já limpa o status de volta
        // pra "active" agora — sem esperar o worker assíncrono. A
        // renovação completa de créditos continua acontecendo de forma
        // assíncrona via `dispatchStripeSubscriptionEvent` abaixo, como
        // sempre (ver `ResolvePastDueGracePeriodUseCase` para detalhes de
        // por que rodar os dois não duplica efeito sobre créditos).
        const resolveGracePeriodUseCase = makeResolvePastDueGracePeriodUseCase();
        await resolveGracePeriodUseCase.execute({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });

        await dispatchStripeSubscriptionEvent(
          {
            eventType: "invoice.payment_succeeded",
            customerId,
            subscriptionId,
            priceId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            billingReason,
          },
          event.id
        );
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
        await dispatchStripeSubscriptionEvent(
          {
            eventType: "customer.subscription.updated",
            customerId,
            subscriptionId,
            status,
            cancelAtPeriodEnd,
          },
          event.id
        );
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? "";
      const subscriptionId = subscription.id;

      if (customerId && subscriptionId) {
        await dispatchStripeSubscriptionEvent(
          {
            eventType: "customer.subscription.deleted",
            customerId,
            subscriptionId,
          },
          event.id
        );
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as unknown as {
        customer?: string | { id: string } | null;
        subscription?: string | { id: string } | null;
        parent?: {
          subscription_details?: {
            subscription?: string | { id: string } | null;
          } | null;
        } | null;
      };

      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? "";

      const rawSub =
        invoice.subscription ??
        invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof rawSub === "string" ? rawSub : rawSub?.id;

      if (customerId) {
        // Executado SINCRONAMENTE (não via dispatch assíncrono pro
        // Inngest): a política de negócio exige marcar "past_due" no
        // mesmo instante em que o webhook chega, reagindo à falha de
        // pagamento em vez de esperar o dunning do Stripe (ver
        // `ProcessPaymentFailedUseCase`). O envio ao Inngest abaixo é só
        // para auditoria/observabilidade — ver `notifyStripeBillingEvent`.
        const paymentFailedUseCase = makeProcessPaymentFailedUseCase();
        await paymentFailedUseCase.execute({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        });

        await notifyStripeBillingEvent(
          {
            eventType: "invoice.payment_failed",
            customerId,
            subscriptionId,
          },
          event.id
        );
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as unknown as {
        id?: string;
        customer?: string | { id: string } | null;
        invoice?: string | { id: string } | null;
        // `amount_refunded` é o campo real enviado pelo Stripe no payload
        // padrão do webhook (sem expansão): numérico, em centavos,
        // **cumulativo** — soma de todos os reembolsos já aplicados a este
        // charge, incluindo parciais anteriores. `refunds.data` só existe se
        // a chamada à API expandir explicitamente esse campo, o que nunca
        // acontece em webhooks — por isso nunca deve ser usado como fonte.
        amount_refunded?: number;
      };

      const customerId =
        typeof charge.customer === "string"
          ? charge.customer
          : charge.customer?.id ?? "";

      const invoiceId =
        typeof charge.invoice === "string"
          ? charge.invoice
          : charge.invoice?.id;

      const refundAmountCents = charge.amount_refunded ?? 0;

      if (customerId) {
        // Síncrono de propósito — ver comentário em "invoice.payment_failed"
        // acima. Revoga só os créditos do período afetado; não suspende a
        // conta (ver `ProcessChargeRefundUseCase`).
        const refundUseCase = makeProcessChargeRefundUseCase();
        await refundUseCase.execute({
          stripeCustomerId: customerId,
          refundAmountCents,
          chargeId: charge.id,
          invoiceId,
        });

        await notifyStripeBillingEvent(
          {
            eventType: "charge.refunded",
            customerId,
            chargeId: charge.id,
            invoiceId,
            amountCents: refundAmountCents,
          },
          event.id
        );
      }
    } else if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as unknown as {
        id?: string;
        charge?: string | { id: string } | null;
        customer?: string | { id: string } | null;
        amount?: number;
      };

      const customerId =
        typeof dispute.customer === "string"
          ? dispute.customer
          : dispute.customer?.id ?? "";

      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      const disputeAmountCents = dispute.amount ?? 0;

      if (customerId) {
        // Síncrono de propósito — ver comentário em "invoice.payment_failed"
        // acima. Mesmo comportamento de "charge.refunded": revoga créditos
        // do período, não suspende a conta (ver `ProcessChargeDisputeUseCase`).
        const disputeUseCase = makeProcessChargeDisputeUseCase();
        await disputeUseCase.execute({
          stripeCustomerId: customerId,
          disputeAmountCents,
          chargeId,
        });

        await notifyStripeBillingEvent(
          {
            eventType: "charge.dispute.created",
            customerId,
            chargeId,
            amountCents: disputeAmountCents,
          },
          event.id
        );
      }
    }
}
