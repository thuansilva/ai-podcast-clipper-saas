import { inngest } from "~/inngest/client";
import {
  makeAddCreditsFromStripeWebhookUseCase,
  makeProcessSubscriptionCheckoutUseCase,
  makeProcessSubscriptionRenewalUseCase,
  makeExpireSubscriptionUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { PrismaSubscriptionRepository } from "~/infrastructure/database/repositories/prisma-subscription.repository";

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

/**
 * Payload de notificação "fire-and-forget" para eventos de billing que são
 * processados SINCRONAMENTE no próprio handler do webhook (ver
 * `src/app/api/webhooks/stripe/route.ts`): `invoice.payment_failed`,
 * `charge.refunded` e `charge.dispute.created`.
 *
 * Diferente de `StripeCheckoutPayload`/`StripeSubscriptionPayload` (cujo
 * dispatch para o Inngest é a ÚNICA execução da regra de negócio, de forma
 * assíncrona), esses 3 eventos precisam reagir *imediatamente* — a política
 * de negócio exige marcar `past_due`/revogar créditos no mesmo instante em
 * que o webhook chega, não esperar um worker assíncrono (ver
 * `ProcessPaymentFailedUseCase`/`ProcessChargeRefundUseCase`/
 * `ProcessChargeDisputeUseCase`, chamados diretamente pela rota). O envio
 * ao Inngest aqui é só para auditoria/observabilidade (ex.: uma função que
 * notifique o time de ops) — por isso NENHUMA função Inngest deve reagir a
 * `"stripe/billing-event.recorded"` repetindo a mutação, ou o crédito seria
 * revogado em dobro em produção.
 */
export interface StripeBillingEventNotification {
  eventType: "invoice.payment_failed" | "charge.refunded" | "charge.dispute.created";
  customerId: string;
  subscriptionId?: string;
  chargeId?: string;
  invoiceId?: string;
  amountCents?: number;
}

export class StripeBackgroundQueue {
  private checkoutQueue: StripeCheckoutPayload[] = [];
  private subscriptionQueue: StripeSubscriptionPayload[] = [];
  private activeWorkers = 0;
  private readonly maxConcurrency = 10;

  /**
   * @param stripeEventId id do evento do Stripe (`event.id`), usado como
   * idempotency key nativa do Inngest (`id` no payload de `send`). Se
   * ausente (ex.: chamadas internas sem evento de origem), o dispatch
   * segue sem idempotency key no Inngest.
   *
   * Importante: quando o Inngest Cloud está configurado
   * (`INNGEST_EVENT_KEY`), uma falha em `inngest.send` NÃO cai mais num
   * fallback silencioso para a fila em memória — o erro é propagado pro
   * chamador. Esse fallback escondia falhas reais de dispatch e permitia
   * que o evento fosse marcado como processado no banco mesmo sem nunca
   * ter sido de fato enfileirado (bug de perda silenciosa de crédito). A
   * fila em memória continua existindo apenas para quando o Inngest não
   * está configurado (dev local sem Inngest Cloud/dev server).
   */
  async enqueue(
    payload: StripeCheckoutPayload,
    stripeEventId?: string
  ): Promise<void> {
    // 1. Se o Inngest estiver configurado, o dispatch pro Inngest é a
    // única via — falhas devem propagar pro chamador decidir o que fazer
    // (ex.: não marcar o evento como processado e responder 5xx).
    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({
        ...(stripeEventId ? { id: stripeEventId } : {}),
        name: "stripe/checkout.completed",
        data: payload,
      });
      return;
    }

    // 2. In-process queue com limite de concorrência (apenas quando o
    // Inngest não está configurado nesse ambiente).
    this.checkoutQueue.push(payload);
    this.processNext();
  }

  /** Ver documentação de {@link enqueue} sobre `stripeEventId` e o fim do
   * fallback silencioso em caso de falha do dispatch pro Inngest. */
  async enqueueSubscription(
    payload: StripeSubscriptionPayload,
    stripeEventId?: string
  ): Promise<void> {
    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({
        ...(stripeEventId ? { id: stripeEventId } : {}),
        name: "stripe/subscription.event",
        data: {
          ...payload,
          currentPeriodStart: payload.currentPeriodStart?.toISOString(),
          currentPeriodEnd: payload.currentPeriodEnd?.toISOString(),
        },
      });
      return;
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

/**
 * Dispara o evento de checkout pra fila/processamento assíncrono.
 *
 * Retorna a Promise do dispatch (não é mais fire-and-forget): o chamador
 * deve aguardar e tratar falha antes de marcar o evento de origem como
 * processado (ver `src/app/api/webhooks/stripe/route.ts`).
 */
export function dispatchStripeCheckoutEvent(
  payload: StripeCheckoutPayload,
  stripeEventId?: string
): Promise<void> {
  return stripeBackgroundQueue.enqueue(payload, stripeEventId);
}

/** Ver documentação de {@link dispatchStripeCheckoutEvent}. */
export function dispatchStripeSubscriptionEvent(
  payload: StripeSubscriptionPayload,
  stripeEventId?: string
): Promise<void> {
  return stripeBackgroundQueue.enqueueSubscription(payload, stripeEventId);
}

/**
 * Notifica o Inngest (fire-and-forget, com `event.id` como idempotency
 * key) sobre um evento de billing de reembolso/disputa/falha de pagamento
 * cuja regra de negócio já foi executada SINCRONAMENTE pela rota do
 * webhook antes desta chamada (ver {@link StripeBillingEventNotification}
 * para a explicação de por que esses 3 eventos não seguem o padrão
 * assíncrono de {@link dispatchStripeSubscriptionEvent}).
 *
 * Quando o Inngest não está configurado (`INNGEST_EVENT_KEY` ausente), a
 * notificação é simplesmente um no-op — ela é puramente observacional,
 * nunca a via de execução da regra de negócio, então não há nada para
 * "cair" em fallback.
 */
export async function notifyStripeBillingEvent(
  payload: StripeBillingEventNotification,
  stripeEventId?: string
): Promise<void> {
  if (!process.env.INNGEST_EVENT_KEY) {
    return;
  }

  await inngest.send({
    ...(stripeEventId ? { id: stripeEventId } : {}),
    name: "stripe/billing-event.recorded",
    data: payload,
  });
}
