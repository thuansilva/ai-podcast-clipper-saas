# Assinaturas Recorrentes (MRR) e Recargas Avulsas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o sistema duplo de monetização com Assinaturas Recorrentes Mensais (Creator e Pro Studio) e Recargas Avulsas (Small, Medium, Large), com ancoragem de preços (estratégia Apple), renovação mensal com reset de cota, consumo prioritário de créditos e Stripe Customer Portal.

**Architecture:** Clean Architecture com Domain-Driven Design (DDD). O domínio gerencia saldos segregados (`subscriptionCredits` e `oneTimeCredits`) com consumo prioritário. A infraestrutura integra o `StripePaymentGateway` em modos `subscription` e `payment`, com webhooks orquestrados via Inngest para garantir resiliência e concorrência segura. A interface adota o design system Dark Precision Studio com tabs de alternância e precificação ancorada.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, TypeScript, Prisma ORM, PostgreSQL, Stripe SDK, Inngest, Tailwind CSS, Lucide React, Vitest, Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/docs/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md)

## Global Constraints

- **AGENTS.md Critical Rule:** NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário. Todas as alterações devem ser testadas e preparadas no working directory aguardando aprovação explícita.
- **Design System:** Manter conformidade estrita com tokens Dark Precision Studio (`var(--superficie)`, `var(--tinta)`, `var(--ouro)`, `var(--marfim)`, `var(--linha)`, `var(--patina)`).
- **Microcopy:** 100% em português brasileiro (pt-BR).
- **Clean Architecture:** Entidades de domínio puras sem dependência de frameworks ou ORMs; inversão de dependência através de portas e adaptadores.

---

### Task 1: Modelo de Dados Prisma e Entidade de Domínio `User`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/domain/entities/user.ts`
- Modify: `src/domain/ports/user-repository.ts`
- Modify: `src/infrastructure/repositories/prisma-user.repository.ts`
- Test: `tests/unit/domain/entities/user.test.ts`

**Interfaces:**
- Produces: 
  - `Subscription` model in Prisma.
  - `User` entity com `subscriptionCredits`, `oneTimeCredits` e métodos de cálculo/dedução.
  - `IUserRepository.updateCredits(userId, { subscriptionCreditsIncrement?, oneTimeCreditsIncrement? })`.

- [ ] **Step 1: Escrever teste unitário com falha para a entidade `User` com créditos segregados**

```typescript
// tests/unit/domain/entities/user.test.ts (adicionar testes para subscriptionCredits e oneTimeCredits)
it("deve inicializar com créditos segregados corretamente", () => {
  const user = User.create({
    id: "user_1",
    email: "user@test.com",
    name: "User Test",
    subscriptionCredits: 150,
    oneTimeCredits: 50,
  });

  expect(user.subscriptionCredits).toBe(150);
  expect(user.oneTimeCredits).toBe(50);
  expect(user.credits).toBe(200); // Saldo total derivado
});

it("deve consumir primeiro da assinatura e depois de avulsos", () => {
  const user = User.restore({
    id: "user_1",
    email: "user@test.com",
    name: "User Test",
    credits: 170,
    subscriptionCredits: 150,
    oneTimeCredits: 20,
    reservedCredits: 0,
    plan: "CREATOR",
  });

  // Consome 160 créditos (deve tirar 150 da assinatura e 10 do avulso)
  const { debitedSubscription, debitedOneTime } = user.deductCreditsPrioritized(160);

  expect(debitedSubscription).toBe(150);
  expect(debitedOneTime).toBe(10);
  expect(user.subscriptionCredits).toBe(0);
  expect(user.oneTimeCredits).toBe(10);
  expect(user.credits).toBe(10);
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**

Run: `npm run test tests/unit/domain/entities/user.test.ts`
Expected: FAIL indicando que `deductCreditsPrioritized`, `subscriptionCredits` ou `oneTimeCredits` não existem.

- [ ] **Step 3: Atualizar `prisma/schema.prisma` com modelo `Subscription` e campos no `User`**

```prisma
model Subscription {
    id                   String   @id @default(cuid())
    userId               String   @unique
    stripeSubscriptionId String   @unique
    stripePriceId        String
    status               String   // "active", "canceled", "past_due", "incomplete"
    currentPeriodStart   DateTime
    currentPeriodEnd     DateTime
    cancelAtPeriodEnd    Boolean  @default(false)
    plan                 String   // "CREATOR", "PRO_STUDIO"
    monthlyCredits       Int      // 150 ou 500
    createdAt            DateTime @default(now())
    updatedAt            DateTime @updatedAt

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
    id                  String              @id
    name                String?
    email               String              @unique
    emailVerified       DateTime?
    password            String?
    credits             Int                 @default(10)
    subscriptionCredits Int                 @default(0)
    oneTimeCredits      Int                 @default(10)
    reservedCredits     Int                 @default(0)
    stripeCustomerId    String?             @unique
    image               String?
    plan                String              @default("STARTER")
    subscription        Subscription?
    creditTransactions  CreditTransaction[]
    uploadedFiles       UploadedFile[]
    clips               Clip[]
}
```

Executar: `npx prisma db push` para aplicar ao Postgres local.

- [ ] **Step 4: Implementar métodos de créditos segregados em `src/domain/entities/user.ts`**

Implementar `subscriptionCredits`, `oneTimeCredits` e o método `deductCreditsPrioritized(amount: number)`.
Atualizar `src/domain/ports/user-repository.ts` e `src/infrastructure/repositories/prisma-user.repository.ts` para persistir os campos.

- [ ] **Step 5: Executar teste unitário para verificar aprovação (GREEN)**

Run: `npm run test tests/unit/domain/entities/user.test.ts`
Expected: PASS

---

### Task 2: Casos de Uso de Consumo e Reserva Prioritária de Créditos

**Files:**
- Modify: `src/application/use-cases/credits/hold-credits.use-case.ts`
- Modify: `src/application/use-cases/credits/consume-credits.use-case.ts`
- Test: `tests/unit/application/credits/hold-credits.use-case.test.ts`
- Test: `tests/unit/application/credits/consume-credits.use-case.test.ts`

**Interfaces:**
- Consumes: `User.deductCreditsPrioritized(amount)` da Task 1.
- Produces: Consumo atômico e transacional no Unit of Work.

- [ ] **Step 1: Escrever testes unitários com falha para consumo prioritário de créditos**

```typescript
// tests/unit/application/credits/consume-credits.use-case.test.ts
it("deve debitar primeiro da assinatura e registrar auditoria correta", async () => {
  // Configurar usuário mock com 150 subscriptionCredits e 50 oneTimeCredits
  // Executar consumeCreditsUseCase com 160 créditos
  // Verificar que userRepository.updateCredits recebeu o decremento correto
  // e que a CreditTransaction foi persistida com os metadados
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**

Run: `npm run test tests/unit/application/credits/consume-credits.use-case.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar a dedução inteligente em `hold-credits.use-case.ts` e `consume-credits.use-case.ts`**

Garantir que a reserva (`reservedCredits`) continue bloqueando o saldo total e que a efetivação (`consume`) utilize a segregação prioritária.

- [ ] **Step 4: Executar testes para verificar aprovação (GREEN)**

Run: `npm run test tests/unit/application/credits/hold-credits.use-case.test.ts tests/unit/application/credits/consume-credits.use-case.test.ts`
Expected: PASS

---

### Task 3: Extensão do Gateway Stripe (Modo Assinatura, Avulso e Portal)

**Files:**
- Modify: `src/domain/ports/payment-gateway.ts`
- Modify: `src/infrastructure/payments/stripe-payment.gateway.ts`
- Modify: `src/actions/stripe.ts`
- Test: `tests/unit/infrastructure/stripe-payment.gateway.test.ts`
- Test: `tests/unit/stripe-action.test.ts`

**Interfaces:**
- Produces:
  - `createCheckoutSession({ customerId, priceId, mode: "payment" | "subscription", successUrl, cancelUrl })`
  - `createBillingPortalSession({ customerId, returnUrl })`
  - Server Actions: `createCheckoutSessionAction` e `createCustomerPortalSessionAction`.

- [ ] **Step 1: Escrever testes unitários com falha para os modos de checkout e portal**

```typescript
// tests/unit/infrastructure/stripe-payment.gateway.test.ts
it("deve criar sessão de checkout com mode 'subscription' quando solicitado", async () => {
  // Testar chamada do stripe.checkout.sessions.create com mode: "subscription"
});

it("deve criar sessão de checkout com mode 'payment' para recargas avulsas", async () => {
  // Testar chamada do stripe.checkout.sessions.create com mode: "payment"
});

it("deve gerar URL do Billing Portal quando solicitado", async () => {
  // Testar chamada do stripe.billingPortal.sessions.create
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**

Run: `npm run test tests/unit/infrastructure/stripe-payment.gateway.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar métodos em `StripePaymentGateway` e Server Actions em `src/actions/stripe.ts`**

Adicionar suporte a `mode: "subscription" | "payment"` e implementar `createBillingPortalSession`.
Expor `createCheckoutSession(priceId, mode)` e `createPortalSession()` em `src/actions/stripe.ts`.

- [ ] **Step 4: Executar testes para verificar aprovação (GREEN)**

Run: `npm run test tests/unit/infrastructure/stripe-payment.gateway.test.ts tests/unit/stripe-action.test.ts`
Expected: PASS

---

### Task 4: Webhooks do Stripe e Casos de Uso do Ciclo de Vida da Assinatura

**Files:**
- Create: `src/application/use-cases/credits/process-subscription-renewal.use-case.ts`
- Create: `src/application/use-cases/credits/expire-subscription.use-case.ts`
- Modify: `src/inngest/functions.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `tests/unit/application/credits/process-subscription-renewal.use-case.test.ts`
- Test: `tests/unit/application/credits/expire-subscription.use-case.test.ts`
- Test: `tests/unit/api/stripe-webhook.test.ts`

**Interfaces:**
- Produces:
  - `ProcessSubscriptionRenewalUseCase`: atualiza ciclo e reseta cota mensal.
  - `ExpireSubscriptionUseCase`: encerra assinatura e volta plano para STARTER.
  - Tratamento dos eventos Stripe no webhook: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.

- [ ] **Step 1: Escrever testes unitários com falha para renovação e expiração de assinatura**

```typescript
// tests/unit/application/credits/process-subscription-renewal.use-case.test.ts
it("deve resetar cota de assinatura mensal e manter créditos avulsos intactos", async () => {
  // Usuário com 30 subscriptionCredits e 50 oneTimeCredits
  // Executar renovação de plano Creator (150 créditos)
  // Verificar: subscriptionCredits = 150, oneTimeCredits = 50, credits = 200
  // Verificar transação 'SUBSCRIPTION_RENEWAL'
});
```

- [ ] **Step 2: Executar testes para verificar falha (RED)**

Run: `npm run test tests/unit/application/credits/process-subscription-renewal.use-case.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar casos de uso e orquestração no Inngest**

Implementar `ProcessSubscriptionRenewalUseCase` e `ExpireSubscriptionUseCase`.
Registrar a função `processSubscriptionEvent` no Inngest e conectar no webhook do Stripe em `src/app/api/webhooks/stripe/route.ts`.

- [ ] **Step 4: Executar testes de webhooks e casos de uso para verificar aprovação (GREEN)**

Run: `npm run test tests/unit/application/credits/process-subscription-renewal.use-case.test.ts tests/unit/api/stripe-webhook.test.ts`
Expected: PASS

---

### Task 5: Interface do Usuário - Redesign de Billing com Ancoragem de Preços

**Files:**
- Modify: `src/app/dashboard/billing/page.tsx`
- Create: `src/components/billing/active-subscription-card.tsx`
- Create: `src/components/billing/pricing-toggle-tabs.tsx`
- Test: `tests/unit/components/billing-page.test.tsx`

**Interfaces:**
- Produces:
  - Tela `/dashboard/billing` com alternador (Planos Mensais vs Recargas Avulsas).
  - Ancoragem visual no card Pro Studio (~~$79.99~~ $49.99, badge 38% OFF, fila prioritária de GPU).
  - Card de assinatura ativa com botão "Gerenciar Assinatura" direcionando para o Stripe Portal.

- [ ] **Step 1: Escrever testes com falha para a nova UI de faturamento**

```typescript
// tests/unit/components/billing-page.test.tsx
it("deve renderizar alternador entre Planos Mensais e Recargas Avulsas", () => {
  // Renderizar componente
  // Verificar tabs: 'Planos Mensais' e 'Recargas Avulsas'
});

it("deve exibir card Pro Studio com ancoragem de preço de $79.99 para $49.99", () => {
  // Verificar presença do preço riscado e badge de desconto
});

it("deve exibir botão de gerenciar assinatura para usuários com assinatura ativa", () => {
  // Renderizar com mock de usuário assinante ativo
  // Verificar botão 'Gerenciar Assinatura'
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**

Run: `npm run test tests/unit/components/billing-page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implementar componentes visuais e atualizar `src/app/dashboard/billing/page.tsx`**

Implementar `ActiveSubscriptionCard`, `PricingToggleTabs` e aplicar tokens de design Dark Precision Studio.
Integrar chamadas às Server Actions de checkout e portal.

- [ ] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npm run test tests/unit/components/billing-page.test.tsx`
Expected: PASS

---

### Task 6: Verificação Completa e Testes de Regressão

**Files:**
- Run full test suite
- Typecheck & Lint
- Production Build

- [ ] **Step 1: Executar todos os testes unitários**
Run: `npm run test`
Expected: 100% dos testes passando sem erros.

- [ ] **Step 2: Executar checagem de tipos e linter**
Run: `npm run check`
Expected: 0 erros, 0 warnings.

- [ ] **Step 3: Executar build de produção**
Run: `npm run build`
Expected: Compilação bem-sucedida de todas as rotas e páginas.
