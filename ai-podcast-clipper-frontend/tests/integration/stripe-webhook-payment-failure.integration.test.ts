/**
 * @vitest-environment node
 *
 * Testes de integração: fluxo completo de webhooks de falha de pagamento do Stripe
 * (invoice.payment_failed, charge.refunded, charge.dispute.created),
 * passando pelo banco Postgres real (docker-compose).
 *
 * IMPORTANTES: Estes testes DEVEM FALHAR hoje (vermelho) porque os handlers
 * desses eventos não existem ainda na rota webhook (route.ts:60-239).
 *
 * Red → Green TDD:
 * - Todo teste deve ter uma asserção incondicional que falhe contra o código atual
 * - Após implementação dos handlers, estes testes passarão
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "~/server/db";
import Stripe from "stripe";
import { POST } from "~/app/api/webhooks/stripe/route";
import { inngest } from "~/inngest/client";
import { makeSuspendExpiredPastDueSubscriptionsUseCase } from "~/infrastructure/factories/use-case-factories";

// Mock do inngest
vi.mock("~/inngest/client");

const mockInngestSend = vi.fn();
(inngest as any).send = mockInngestSend;

describe("Stripe Webhook Payment Failure & Refunds - Integration Tests (RED → GREEN TDD)", () => {
  const stripe = new Stripe("sk_test_mock", {
    apiVersion: "2025-04-30.basil",
  });
  const STRIPE_WEBHOOK_SECRET = "whsec_mock";

  let createdUserIds: string[] = [];

  async function createTestUser(stripeCustomerId: string) {
    const user = await db.user.create({
      data: {
        id: `user_payment_fail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `payment-fail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        stripeCustomerId,
        credits: 100,
        subscriptionCredits: 150,
        oneTimeCredits: 50,
        plan: "STARTER",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createActiveSubscription(userId: string, stripeCustomerId: string) {
    const subscription = await db.subscription.create({
      data: {
        userId,
        stripeSubscriptionId: `sub_active_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        stripePriceId: "price_starter_monthly_test",
        status: "active",
        plan: "STARTER",
        monthlyCredits: 150,
        currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    return subscription;
  }

  function createStripeEvent(
    eventType: string,
    eventId: string,
    customerId: string,
    additionalData: any = {}
  ): Stripe.Event {
    const baseEvent: Stripe.Event = {
      id: eventId,
      object: "event",
      api_version: "2025-04-30.basil",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {} as any,
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: null,
        idempotency_key: null,
      },
      type: eventType as any,
    };

    if (eventType === "invoice.payment_succeeded") {
      // NOTA (domain-specialist, fase verde): este branch estava faltando
      // no helper original — sem ele, `data.object` ficava `{}` para
      // "invoice.payment_succeeded" e nenhuma implementação (correta ou
      // não) conseguiria extrair `customer`/`subscription`/`billing_reason`
      // no Cenário 2 (teste "invoice.payment_succeeded durante carência
      // reverte status PAST_DUE"). Adicionado para espelhar o mesmo
      // formato que `src/app/api/webhooks/stripe/route.ts` já espera
      // (consistente com os demais branches abaixo).
      baseEvent.data.object = {
        id: "in_test_payment_succeeded",
        customer: customerId,
        subscription: additionalData.subscriptionId || "sub_test",
        billing_reason: additionalData.billing_reason || "subscription_cycle",
        lines: { data: [] },
        ...additionalData,
      } as any;
    } else if (eventType === "invoice.payment_failed") {
      baseEvent.data.object = {
        id: "in_test_payment_failed",
        customer: customerId,
        subscription: additionalData.subscriptionId || "sub_test",
        attempt_count: 1,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 86400 * 7, // próxima tentativa em 7 dias
        ...additionalData,
      } as any;
    } else if (eventType === "charge.refunded") {
      baseEvent.data.object = {
        id: "ch_test_refunded",
        customer: customerId,
        refunded: true,
        amount_refunded: additionalData.refundAmount || 2999, // em cents — campo real do Stripe no webhook
        // IMPORTANTE: Stripe NUNCA envia charge.refunds.data no webhook padrão,
        // apenas se você expandir explicitamente (expand: ['refunds']), o que
        // não acontece aqui. Por isso deixamos undefined/ausente, refletindo
        // a realidade do payload de webhook.
        invoice: additionalData.invoiceId || "in_test",
        ...additionalData,
      } as any;
    } else if (eventType === "charge.dispute.created") {
      baseEvent.data.object = {
        id: "dp_test_dispute",
        charge: additionalData.chargeId || "ch_test",
        customer: customerId,
        amount: additionalData.amount || 2999, // em cents
        reason: "fraudulent",
        status: "under_review",
        evidence_details: {
          due_by: Math.floor(Date.now() / 1000) + 86400 * 7,
          submission_count: 0,
        },
        ...additionalData,
      } as any;
    }

    return baseEvent;
  }

  function createMockRequest(event: Stripe.Event): Request {
    const body = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      secret: STRIPE_WEBHOOK_SECRET,
      payload: body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    return new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body,
    });
  }

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  describe("Cenário 1: invoice.payment_failed → marca PAST_DUE, sem revogação imediata", () => {
    it("DEVE FALHAR hoje: invoice.payment_failed marca subscription como PAST_DUE e dispatcher é chamado", async () => {
      // RED: Teste falha porque não há handler para invoice.payment_failed
      // VERDE: após implementação do handler

      const customerId = `cus_payment_fail_${Date.now()}`;
      const subscriptionId = `sub_payment_fail_${Date.now()}`;
      const eventId = `evt_payment_fail_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      const event = createStripeEvent(
        "invoice.payment_failed",
        eventId,
        customerId,
        {
          subscriptionId: subscription.stripeSubscriptionId,
        }
      );
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);

      const response = await POST(request.clone());

      // Asserção 1: resposta deve ser 200 OK (evento foi despachado)
      // FALHA hoje porque não há handler e evento não é despachado
      expect(response.status).toBe(200);

      // Asserção 2: inngest.send deve ter sido chamado (evento foi despachado)
      // FALHA hoje
      expect(mockInngestSend).toHaveBeenCalled();

      // Asserção 3: Subscription deve estar marcada como PAST_DUE
      // FALHA hoje (subscription não é atualizada porque não há handler)
      const updatedSubscription = await db.subscription.findUnique({
        where: { id: subscription.id },
      });
      expect(updatedSubscription?.status).toBe("past_due");

      // Asserção 4: Créditos do usuário NÃO devem ser revogados imediatamente
      // (ainda dentro da carência)
      // FALHA hoje (créditos podem estar zerados)
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.subscriptionCredits).toBe(150); // não revogado
      expect(updatedUser?.credits).toBeGreaterThan(0); // acesso mantido

      // Asserção 5: Evento deve estar marcado como processado
      // FALHA hoje
      const processedEvent = await db.processedWebhookEvent.findUnique({
        where: { stripeEventId: eventId },
      });
      expect(processedEvent).toBeTruthy();
    });
  });

  describe("Cenário 2: Janela de carência (3 dias) após payment_failed", () => {
    it("DEVE FALHAR hoje: Após 3+ dias sem resolução, usuario deve ser suspenso (acesso revogado)", async () => {
      // RED: Teste falha porque:
      // 1. invoice.payment_failed não marca PAST_DUE
      // 2. não há lógica de verificação de "expiração da carência"
      // VERDE: após implementação

      const customerId = `cus_grace_period_${Date.now()}`;
      const subscriptionId = `sub_grace_period_${Date.now()}`;
      const eventId = `evt_grace_period_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      // Simular payment_failed acontecendo 4 dias atrás (carência de 3 dias
      // já expirada): grava `pastDueAt` diretamente no passado — campo
      // dedicado adicionado por esta feature (migration
      // `20261003000000_add_subscription_past_due_at`) justamente para não
      // depender de `updatedAt` (que muda a cada update da linha por
      // qualquer motivo, não só ao entrar em carência).
      const gracePeriodStartDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 dias atrás

      // Atualizar subscription para simular que ficou PAST_DUE há 4 dias atrás
      // (depois de graça de 3 dias)
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "past_due",
          pastDueAt: gracePeriodStartDate, // simular que entrou em PAST_DUE há 4 dias
        },
      });

      // NOTA (domain-specialist, fase verde): o teste original parava
      // aqui e já esperava a suspensão ter acontecido — mas nada entre a
      // atualização direta no banco acima e a asserção abaixo executa a
      // regra de negócio (nenhum endpoint/worker é chamado). A política
      // de suspensão após carência expirada é deliberadamente assíncrona
      // (cron `suspendExpiredPastDueSubscriptions`, ver AGENTS.md/spec:
      // "pode ser uma função Inngest agendada (cron) que verifica
      // periodicamente"), então o teste precisa disparar esse cron
      // explicitamente — do contrário, NENHUMA implementação (correta ou
      // não) poderia fazer esta asserção passar. Chamamos aqui o mesmo
      // Use Case que a função Inngest agendada chama a cada execução.
      const suspendUseCase = makeSuspendExpiredPastDueSubscriptionsUseCase();
      await suspendUseCase.execute();

      // Agora verificar: o usuário deveria estar suspenso
      // (esta é a asserção que faz o teste FALHAR)
      // Esperamos que exista uma lógica que: "se subscription.status === 'past_due'
      // E (agora - pastDueAt) > 3 dias, ENTÃO revoga acesso"
      const userAfterGracePeriod = await db.user.findUnique({
        where: { id: user.id },
      });

      // Asserção incondicional: usuario deve estar sem créditos (acesso revogado)
      // FALHA hoje porque essa lógica não existe
      expect(userAfterGracePeriod?.subscriptionCredits).toBe(0);
      expect(userAfterGracePeriod?.credits).toBeLessThanOrEqual(0);
    });

    it("DEVE FALHAR hoje: invoice.payment_succeeded durante carência reverte status PAST_DUE", async () => {
      // RED: Teste falha porque:
      // 1. invoice.payment_failed não marca PAST_DUE
      // 2. invoice.payment_succeeded não reverte PAST_DUE
      // VERDE: após implementação

      const customerId = `cus_grace_resolve_${Date.now()}`;
      const subscriptionId = `sub_grace_resolve_${Date.now()}`;
      const eventIdFail = `evt_grace_resolve_fail_${Date.now()}`;
      const eventIdSucceed = `evt_grace_resolve_succeed_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      // Evento 1: payment_failed
      const failEvent = createStripeEvent(
        "invoice.payment_failed",
        eventIdFail,
        customerId,
        { subscriptionId: subscription.stripeSubscriptionId }
      );
      const failRequest = createMockRequest(failEvent);

      mockInngestSend.mockResolvedValueOnce({} as any);
      await POST(failRequest.clone());

      // Verificar que ficou PAST_DUE (dentro da carência)
      let currentSubscription = await db.subscription.findUnique({
        where: { id: subscription.id },
      });
      // Esperamos que esteja PAST_DUE após o evento
      // FALHA hoje
      expect(currentSubscription?.status).toBe("past_due");

      // Evento 2: payment_succeeded (resolução durante carência)
      const succeedEvent = createStripeEvent(
        "invoice.payment_succeeded",
        eventIdSucceed,
        customerId,
        {
          subscriptionId: subscription.stripeSubscriptionId,
          billing_reason: "subscription_cycle",
        }
      );
      const succeedRequest = createMockRequest(succeedEvent);

      mockInngestSend.mockResolvedValueOnce({} as any);
      await POST(succeedRequest.clone());

      // Verificar que voltou para "active"
      currentSubscription = await db.subscription.findUnique({
        where: { id: subscription.id },
      });
      // FALHA hoje porque payment_succeeded não reverte PAST_DUE
      expect(currentSubscription?.status).toBe("active");

      // Verificar que créditos foram restaurados
      const userAfterResolve = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(userAfterResolve?.subscriptionCredits).toBe(150);
    });
  });

  describe("Cenário 3: charge.refunded → revoga créditos do período, não suspende", () => {
    it("DEVE FALHAR hoje: charge.refunded revoga créditos do período afetado, mantém conta ativa", async () => {
      // RED: Teste falha porque:
      // 1. Não há handler para charge.refunded
      // 2. Não há lógica de revogação de créditos específicos do período
      // 3. Código atual espera charge.refunds.data (inválido), mas Stripe manda amount_refunded
      // VERDE: após implementação + ajuste do código para usar amount_refunded

      const customerId = `cus_refund_${Date.now()}`;
      const invoiceId = `in_test_refund_${Date.now()}`;
      const chargeId = `cus_refund_${Date.now()}`;
      const eventId = `evt_refund_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      // Quantidade de créditos antes
      const creditsBefore = user.subscriptionCredits;
      const refundAmount = 2999; // em cents = $29.99 (simulando reembolso de parte da assinatura)

      const event = createStripeEvent("charge.refunded", eventId, customerId, {
        chargeId,
        invoiceId,
        refundAmount,
      });
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);
      const response = await POST(request.clone());

      // Asserção 1: Resposta 200 OK
      // FALHA hoje porque não há handler
      expect(response.status).toBe(200);

      // Asserção 2: inngest.send foi chamado
      // FALHA hoje
      expect(mockInngestSend).toHaveBeenCalled();

      // Asserção 3: Créditos foram revogados (reduzidos proporcionalmente)
      // FALHA hoje porque código não lê amount_refunded corretamente
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      // Devemos ter revogado uma quantidade de créditos
      expect(updatedUser?.subscriptionCredits).toBeLessThan(creditsBefore);

      // Asserção 4: Conta continua ATIVA (não foi suspensa)
      // FALHA hoje (se account fica suspensa)
      expect(updatedUser?.credits).toBeGreaterThan(0);

      // Asserção 5: Créditos de períodos anteriores não foram afetados
      // (oneTimeCredits devem estar intactos)
      expect(updatedUser?.oneTimeCredits).toBe(50); // não foi alterado

      // Asserção 6: Transaction foi registrada com tipo "REFUND"
      // FALHA hoje
      const refundTransaction = await db.creditTransaction.findFirst({
        where: {
          userId: user.id,
          type: "REFUND",
        },
      });
      expect(refundTransaction).toBeTruthy();
      expect(refundTransaction?.amount).toBeLessThan(0); // refund é negativo
    });

    it("DEVE FALHAR hoje: reembolso parcial (via amount_refunded, não refunds.data) revoga créditos proporcionais", async () => {
      // RED: Teste falha porque:
      // 1. Código atual ignora amount_refunded (único campo real do Stripe no webhook)
      // 2. Código tenta ler refunds.data (que não vem no webhook padrão)
      // VERDE: após correção usar amount_refunded

      const customerId = `cus_partial_refund_${Date.now()}`;
      const chargeId = `ch_partial_${Date.now()}`;
      const invoiceId = `in_partial_${Date.now()}`;
      const eventId = `evt_partial_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      const creditsBefore = user.subscriptionCredits;
      // $7,50 = metade do preço mensal do Starter ($15,00/1500 cents) — reembolso
      // genuinamente parcial. Usar 1500 aqui testaria 100%, não parcial, porque
      // 1500 é o preço mensal cheio do Starter (ver CreditPricingService).
      const partialRefundCents = 750;

      const event = createStripeEvent("charge.refunded", eventId, customerId, {
        chargeId,
        invoiceId,
        refundAmount: partialRefundCents, // Este valor NUNCA chega em refunds.data
      });
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);
      await POST(request.clone());

      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });

      // Créditos devem ter diminuído (reembolso parcial afeta a conta)
      // FALHA hoje porque amount_refunded (1500 cents) é ignorado
      expect(updatedUser?.subscriptionCredits).toBeLessThan(creditsBefore);
      // Mas não zerado (ainda há créditos sobrando)
      expect(updatedUser?.subscriptionCredits).toBeGreaterThan(0);
    });

    it("DEVE FALHAR hoje: reembolso total (100%) via amount_refunded revoga todos os créditos da assinatura", async () => {
      // RED: Teste falha porque código ignora amount_refunded
      // VERDE: após usar amount_refunded corretamente

      const customerId = `cus_full_refund_${Date.now()}`;
      const chargeId = `ch_full_${Date.now()}`;
      const invoiceId = `in_full_${Date.now()}`;
      const eventId = `evt_full_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      // Simular: charge original era 15000 cents, agora reembolso do mesmo valor
      const fullRefundCents = 15000;

      const event = createStripeEvent("charge.refunded", eventId, customerId, {
        chargeId,
        invoiceId,
        refundAmount: fullRefundCents,
      });
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);
      await POST(request.clone());

      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });

      // Reembolso total revoga todos os créditos de assinatura
      // FALHA hoje porque amount_refunded é ignorado
      expect(updatedUser?.subscriptionCredits).toBe(0);
    });
  });

  describe("Cenário 4: charge.dispute.created → mesmo comportamento de refund", () => {
    it("DEVE FALHAR hoje: charge.dispute.created revoga créditos do período contestado, sem suspensão", async () => {
      // RED: Teste falha porque:
      // 1. Não há handler para charge.dispute.created
      // 2. Não há lógica de revogação de créditos do período
      // VERDE: após implementação

      const customerId = `cus_dispute_${Date.now()}`;
      const chargeId = `ch_test_dispute_${Date.now()}`;
      const eventId = `evt_dispute_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      const creditsBefore = user.subscriptionCredits;
      const disputeAmount = 1999; // em cents

      const event = createStripeEvent("charge.dispute.created", eventId, customerId, {
        chargeId,
        amount: disputeAmount,
      });
      const request = createMockRequest(event);

      mockInngestSend.mockResolvedValueOnce({} as any);
      const response = await POST(request.clone());

      // Asserção 1: Resposta 200 OK
      // FALHA hoje porque não há handler
      expect(response.status).toBe(200);

      // Asserção 2: inngest.send foi chamado
      // FALHA hoje
      expect(mockInngestSend).toHaveBeenCalled();

      // Asserção 3: Créditos foram revogados
      // FALHA hoje
      const updatedUser = await db.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.subscriptionCredits).toBeLessThan(creditsBefore);

      // Asserção 4: Conta continua ATIVA (não foi suspensa)
      // FALHA hoje
      expect(updatedUser?.credits).toBeGreaterThan(0);

      // Asserção 5: oneTimeCredits intactos
      expect(updatedUser?.oneTimeCredits).toBe(50);

      // Asserção 6: Transaction registrada
      // FALHA hoje
      const disputeTransaction = await db.creditTransaction.findFirst({
        where: {
          userId: user.id,
          type: "REFUND", // ou "DISPUTE" se preferir um tipo separado
        },
        orderBy: { createdAt: "desc" },
      });
      expect(disputeTransaction).toBeTruthy();
    });
  });

  describe("Cenário 5: Idempotência dos novos eventos", () => {
    it("DEVE FALHAR hoje: payment_failed duplicado (retry) só processa uma vez", async () => {
      // RED: Teste falha porque não há handler
      // VERDE: após implementação

      const customerId = `cus_payment_fail_idempotent_${Date.now()}`;
      const subscriptionId = `sub_payment_fail_idem_${Date.now()}`;
      const eventId = `evt_payment_fail_idem_${Date.now()}`;
      const user = await createTestUser(customerId);
      const subscription = await createActiveSubscription(user.id, customerId);

      const event = createStripeEvent(
        "invoice.payment_failed",
        eventId,
        customerId,
        { subscriptionId: subscription.stripeSubscriptionId }
      );
      const request = createMockRequest(event);

      // Primeira tentativa
      mockInngestSend.mockResolvedValueOnce({} as any);
      const response1 = await POST(request.clone());
      expect(response1.status).toBe(200);

      // Retry: mesmo event.id
      mockInngestSend.mockResolvedValueOnce({} as any);
      const response2 = await POST(request.clone());
      expect(response2.status).toBe(200);

      // inngest.send deve ter sido chamado apenas 1 vez (idempotência)
      // FALHA hoje porque não há handler
      expect(mockInngestSend).toHaveBeenCalledTimes(1);
    });
  });
});
