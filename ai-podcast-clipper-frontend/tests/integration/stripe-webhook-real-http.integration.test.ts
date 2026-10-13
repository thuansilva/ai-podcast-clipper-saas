/**
 * @vitest-environment node
 *
 * Teste de integração REAL (não mockado) do webhook do Stripe: bate na rota
 * via HTTP de verdade (fetch contra um servidor Next.js real de pé em
 * TEST_BASE_URL/localhost:3000 — mesmo padrão de
 * `tests/integration/legal-pages.test.ts` e
 * `tests/integration/security-headers-csp.integration.test.ts`), com um
 * payload de evento no formato COMPLETO que o Stripe de fato envia (não um
 * objeto reduzido fabricado só com os campos que o handler lê), assinado de
 * verdade com `stripe.webhooks.generateTestHeaderString` (mesma função usada
 * por `scripts/sign-stripe-test-payload.js`).
 *
 * Gap que este teste fecha (docs/operacao/checklist-go-live.md, item HIGH
 * "Webhook Stripe sem teste de integração real"): os testes existentes
 * (`stripe-webhook-idempotency.integration.test.ts`,
 * `stripe-webhook-payment-failure.integration.test.ts`) chamam a função
 * `POST` do route handler diretamente, em processo — nunca passam pela
 * pilha HTTP real do Next.js (parsing do body, headers, roteamento). Este
 * arquivo prova que a rota REAL, servida por um processo `next
 * dev`/`next start` separado, aceita o webhook assinado e aplica o efeito
 * esperado no banco (reembolso revoga créditos — `ProcessChargeRefundUseCase`).
 *
 * Como rodar com o servidor de pé (necessário para ficar verde — sem
 * servidor, falha com ECONNREFUSED, no mesmo grupo dos outros testes de
 * integração HTTP que dependem de `next dev`/`next start` em :3000):
 *
 *   SKIP_ENV_VALIDATION=1 \
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_podcast_clipper?connection_limit=5" \
 *   STRIPE_WEBHOOK_SECRET="whsec_test_secret" \
 *   STRIPE_SECRET_KEY="sk_test_mock" \
 *   ...(demais vars, ver scripts/test-everything.sh, bloco "Build + start")
 *   npm run dev   # ou: npm run build && npm run start
 *
 * O segredo "whsec_test_secret" usado para assinar aqui é deliberadamente o
 * MESMO hardcoded em `scripts/test-everything.sh` (export
 * STRIPE_WEBHOOK_SECRET) e em `load-tests/helpers/stripe-signature.js`
 * (default do k6) — não o `process.env.STRIPE_WEBHOOK_SECRET` de
 * `tests/setup.ts` ("whsec_mock"), porque este teste roda num processo
 * Vitest totalmente separado do processo do servidor Next.js real: os dois
 * só concordam através desse valor hardcoded compartilhado, não através de
 * `process.env` (que não atravessa processos).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { db } from "~/server/db";

const REAL_HTTP_TEST_WEBHOOK_SECRET = "whsec_test_secret";

describe("Stripe Webhook - Integração HTTP real (não mockada)", () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
  const stripe = new Stripe("sk_test_offline_signing_only", {
    apiVersion: "2025-04-30.basil",
  });

  // Diferente de `legal-pages.test.ts`/`security-headers-csp.integration.test.ts`
  // (que falham com ECONNREFUSED quando não há `next dev`/`next start` de pé
  // em :3000, e isso é aceito como baseline conhecido do projeto): este
  // arquivo é NOVO, então em vez de somar mais falhas "esperadas" a esse
  // grupo, faz um health-check rápido em `beforeAll` e usa skip dinâmico
  // (`ctx.skip()`) quando o servidor real não está de pé. Com o servidor de
  // pé (ex. via `npm run test:everything`, ou um `next dev`/`next start`
  // manual com as env vars de `scripts/test-everything.sh`), os testes
  // executam de verdade e falham se o comportamento regredir — não é um
  // skip incondicional, é condicionado à mesma dependência externa que os
  // outros testes HTTP do projeto já têm.
  let serverReachable = false;

  beforeAll(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      serverReachable = res.ok;
    } catch {
      serverReachable = false;
    }
    if (!serverReachable) {
      // eslint-disable-next-line no-console -- sinal visível no output do CI/local de por que os testes abaixo foram pulados
      console.warn(
        `[stripe-webhook-real-http] Servidor real não respondeu em ${baseUrl}/api/health — testes pulados (dependem de "next dev"/"next start" de pé, ver topo do arquivo).`
      );
    }
  });

  const createdUserIds: string[] = [];

  afterEach(async () => {
    // Sem useRollbackTransactionPerTest aqui de propósito: o servidor que
    // processa o webhook é OUTRO processo (`next dev`/`next start`), com sua
    // própria conexão Prisma — uma transação de teste revertida neste
    // processo nunca seria vista por ele. Os dados precisam estar
    // efetivamente commitados no Postgres para o handler real enxergá-los,
    // então a limpeza é manual (delete em cascata via onDelete: Cascade do
    // schema cobre Subscription/CreditTransaction).
    for (const id of createdUserIds) {
      await db.user.delete({ where: { id } }).catch(() => undefined);
    }
    createdUserIds.length = 0;
  });

  /**
   * Payload no formato COMPLETO que o Stripe envia de verdade para
   * `charge.refunded` (campos reais do objeto `Charge`, incluindo os que o
   * handler não lê — `payment_method_details`, `outcome`,
   * `billing_details` etc. — para provar que o parsing da rota tolera o
   * payload real, não só o subconjunto mínimo usado internamente).
   */
  function buildRealChargeRefundedEvent(params: {
    eventId: string;
    customerId: string;
    invoiceId: string;
    chargeId: string;
    amountRefundedCents: number;
  }): Stripe.Event {
    const { eventId, customerId, invoiceId, chargeId, amountRefundedCents } =
      params;
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      id: eventId,
      object: "event",
      api_version: "2025-04-30.basil",
      created: nowSeconds,
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: `req_${eventId}`,
        idempotency_key: null,
      },
      type: "charge.refunded",
      data: {
        object: {
          id: chargeId,
          object: "charge",
          amount: 150000,
          amount_captured: 150000,
          amount_refunded: amountRefundedCents,
          application: null,
          application_fee: null,
          application_fee_amount: null,
          balance_transaction: `txn_${chargeId}`,
          billing_details: {
            address: {
              city: null,
              country: "BR",
              line1: null,
              line2: null,
              postal_code: null,
              state: null,
            },
            email: "cliente-real-http-test@example.com",
            name: "Cliente Teste HTTP Real",
            phone: null,
          },
          calculated_statement_descriptor: "AI PODCAST CLIPPER",
          captured: true,
          created: nowSeconds - 3600,
          currency: "usd",
          customer: customerId,
          description: null,
          destination: null,
          dispute: null,
          disputed: false,
          failure_balance_transaction: null,
          failure_code: null,
          failure_message: null,
          fraud_details: {},
          invoice: invoiceId,
          livemode: false,
          metadata: {},
          on_behalf_of: null,
          order: null,
          outcome: {
            network_status: "approved_by_network",
            reason: null,
            risk_level: "normal",
            risk_score: 12,
            seller_message: "Payment complete.",
            type: "authorized",
          },
          paid: true,
          payment_intent: `pi_${chargeId}`,
          payment_method: `pm_${chargeId}`,
          payment_method_details: {
            card: {
              brand: "visa",
              checks: {
                address_line1_check: null,
                address_postal_code_check: null,
                cvc_check: "pass",
              },
              country: "US",
              exp_month: 12,
              exp_year: 2030,
              fingerprint: "fingerprint_mock",
              funding: "credit",
              installments: null,
              last4: "4242",
              network: "visa",
              three_d_secure: null,
              wallet: null,
            },
            type: "card",
          },
          receipt_email: null,
          receipt_number: null,
          receipt_url: `https://pay.stripe.com/receipts/${chargeId}`,
          refunded: amountRefundedCents >= 150000,
          review: null,
          shipping: null,
          source_transfer: null,
          statement_descriptor: null,
          statement_descriptor_suffix: null,
          status: "succeeded",
          transfer_data: null,
          transfer_group: null,
          // IMPORTANTE: o Stripe NUNCA inclui `refunds.data` expandido no
          // payload padrão do webhook (só com `expand: ["refunds"]`
          // explícito numa chamada de API, o que não é o caso aqui) — por
          // isso `refunds` abaixo reflete o formato real (lista vazia,
          // `has_more: false`), e o handler real
          // (`ProcessChargeRefundUseCase`) precisa usar `amount_refunded`,
          // não `refunds.data`, igual os testes mockados já cobrem.
          refunds: {
            object: "list",
            data: [],
            has_more: false,
            total_count: 0,
            url: `/v1/charges/${chargeId}/refunds`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture reflete o payload real do Stripe (tipos completos do SDK são verbosos demais para um fixture de teste)
        } as any,
      },
    } as Stripe.Event;
  }

  async function createUserWithActiveSubscription(params: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await db.user.create({
      data: {
        id: `user_real_http_${suffix}`,
        email: `real-http-${suffix}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId: params.stripeCustomerId,
        credits: 100,
        subscriptionCredits: 150,
        oneTimeCredits: 50,
        plan: "STARTER",
      },
    });
    createdUserIds.push(user.id);

    await db.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripePriceId: "price_starter_monthly_test",
        status: "active",
        plan: "STARTER",
        monthlyCredits: 150,
        currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    return user;
  }

  function signAndBuildRequest(event: Stripe.Event): Request {
    const body = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      secret: REAL_HTTP_TEST_WEBHOOK_SECRET,
      payload: body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    return new Request(`${baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body,
    });
  }

  it(
    "charge.refunded com payload real assinado, via HTTP de verdade, " +
      "revoga créditos no Postgres real (efeito observável pelo servidor real)",
    async (ctx) => {
      if (!serverReachable) {
        ctx.skip();
        return;
      }
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const customerId = `cus_real_http_${suffix}`;
      const subscriptionId = `sub_real_http_${suffix}`;
      const invoiceId = `in_real_http_${suffix}`;
      const chargeId = `ch_real_http_${suffix}`;
      const eventId = `evt_real_http_${suffix}`;

      await createUserWithActiveSubscription({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const event = buildRealChargeRefundedEvent({
        eventId,
        customerId,
        invoiceId,
        chargeId,
        // Reembolso total (igual ao `amount` do charge) — revoga todos os
        // créditos de assinatura do período, igual o cenário já coberto
        // (mockado) em stripe-webhook-payment-failure.integration.test.ts.
        amountRefundedCents: 150000,
      });

      const response = await fetch(signAndBuildRequest(event));

      expect(response.status).toBe(200);

      const user = await db.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      expect(user).not.toBeNull();
      expect(user?.subscriptionCredits).toBe(0);
      // Créditos avulsos (de outro período/produto) não são tocados pelo
      // reembolso da assinatura.
      expect(user?.oneTimeCredits).toBe(50);

      const refundTransaction = await db.creditTransaction.findFirst({
        where: { userId: user!.id, type: "REFUND" },
      });
      expect(refundTransaction).not.toBeNull();
      expect(refundTransaction?.amount).toBeLessThan(0);

      const processedEvent = await db.processedWebhookEvent.findUnique({
        where: { stripeEventId: eventId },
      });
      expect(processedEvent).not.toBeNull();
      expect(processedEvent?.eventType).toBe("charge.refunded");
    }
  );

  it(
    "retry do Stripe com o mesmo event.id, via HTTP de verdade, não revoga " +
      "créditos uma segunda vez (idempotência observada ponta a ponta)",
    async (ctx) => {
      if (!serverReachable) {
        ctx.skip();
        return;
      }
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const customerId = `cus_real_http_retry_${suffix}`;
      const subscriptionId = `sub_real_http_retry_${suffix}`;
      const invoiceId = `in_real_http_retry_${suffix}`;
      const chargeId = `ch_real_http_retry_${suffix}`;
      const eventId = `evt_real_http_retry_${suffix}`;

      await createUserWithActiveSubscription({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const event = buildRealChargeRefundedEvent({
        eventId,
        customerId,
        invoiceId,
        chargeId,
        amountRefundedCents: 75000, // reembolso parcial (metade)
      });

      const firstResponse = await fetch(signAndBuildRequest(event));
      expect(firstResponse.status).toBe(200);

      const userAfterFirst = await db.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      const creditsAfterFirst = userAfterFirst!.subscriptionCredits;
      expect(creditsAfterFirst).toBeLessThan(150);

      // Stripe reentrega o mesmo evento (mesmo event.id) — ex.: a conexão
      // caiu antes do Stripe receber a resposta 200 original.
      const retryResponse = await fetch(signAndBuildRequest(event));
      expect(retryResponse.status).toBe(200);

      const userAfterRetry = await db.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      // Idempotência: créditos não são revogados duas vezes.
      expect(userAfterRetry?.subscriptionCredits).toBe(creditsAfterFirst);
    }
  );
});
