# Especificação de Design: Assinaturas Recorrentes (MRR) e Recargas Avulsas de Créditos

- **Data:** 14 de Setembro de 2026
- **Status:** Proposto (Aprovado em Brainstorming)
- **Módulo:** Faturamento, Assinaturas e Gestão de Créditos (`billing`, `stripe`, `inngest`)
- **Arquitetura:** Clean Architecture / DDD / Dark Precision Studio Design System

---

## 1. Visão Geral e Objetivos

Atualmente, o SaaS possui apenas compras avulsas de pacotes de crédito (Small, Medium, Large) com pagamento único. O objetivo desta especificação é transformar o modelo de monetização do produto em um sistema híbrido de alta conversão:

1. **Assinaturas Recorrentes Mensais (MRR):** Planos com desconto recorrente e renovação automática a cada 30 dias, gerando receita previsível.
2. **Recargas Avulsas (Pay-as-you-go):** Pacotes avulsos com preço por minuto ligeiramente superior, sem renovação e cujos créditos nunca expiram.
3. **Estratégia de Ancoragem de Preço (Price Anchoring / Efeito Chamariz da Apple):** Destaque ao plano *Pro Studio* ($49.99/mês) ancorado contra o preço avulso de $69.99/mês e preço cheio de $79.99, tornando a assinatura a escolha economicamente óbvia para o cliente.
4. **Regras Claras de Créditos:**
   - A cota mensal da assinatura é renovada no dia do faturamento (reset mensal / *use-it-or-lose-it*).
   - Créditos avulsos adquiridos à parte **nunca expiram**.
   - O consumo ao processar vídeos drena **primeiro** os créditos de assinatura (que expiram), preservando os créditos avulsos.
5. **Autoatendimento Seguro (Stripe Customer Portal):** Assinantes podem gerenciar cartão de crédito, baixar recibos em PDF e solicitar cancelamento diretamente no portal seguro do Stripe.
6. **Cancelamento Elegante:** Cancelamentos solicitados entram em vigor no final do período faturado (`cancel_at_period_end`), mantendo o acesso até o último dia pago.

---

## 2. Estrutura de Planos e Preços

| Modalidade | Nome do Plano / Pacote | Preço | Créditos Inclusos | Benefícios & Destaques |
| :--- | :--- | :---: | :---: | :--- |
| **Assinatura** | **Creator** | **$19.99 / mês** | 150 créditos | • 150 minutos (~2h30) renovados todo mês<br>• Rastreamento facial inteligente (LR-ASD)<br>• Legendas dinâmicas 1080p 60fps |
| **Assinatura** | **Pro Studio** *(Mais Popular)* | **$49.99 / mês**<br>*(De ~~$79.99~~ • 38% OFF)* | 500 créditos | • 500 minutos (~8h20) renovados todo mês<br>• **Fila de renderização com prioridade máxima (GPU Ultra)**<br>• Apenas $0,10 por minuto de vídeo<br>• Suporte prioritário |
| **Avulso** | **Small Pack** | **$9.99** *(único)* | 50 créditos | • 50 créditos avulsos<br>• Sem mensalidade / Nunca expiram |
| **Avulso** | **Medium Pack** | **$24.99** *(único)* | 150 créditos | • 150 créditos avulsos<br>• Sem mensalidade / Nunca expiram |
| **Avulso** | **Large Pack** | **$69.99** *(único)* | 500 créditos | • 500 créditos avulsos<br>• Sem mensalidade / Nunca expiram |

---

## 3. Modelo de Dados e Banco de Dados (Prisma)

### 3.1. Novo Modelo: `Subscription`
Armazena os metadados de sincronização com o Stripe para o usuário ativo:

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
```

### 3.2. Atualização no Modelo `User`
```prisma
model User {
    id                  String              @id
    name                String?
    email               String              @unique
    emailVerified       DateTime?
    password            String?
    credits             Int                 @default(10) // Saldo Total Disponível (subscriptionCredits + oneTimeCredits)
    subscriptionCredits Int                 @default(0)  // Cota do mês (expira na data da renovação)
    oneTimeCredits      Int                 @default(10) // Créditos avulsos permanentes (novos usuários recebem 10 grátis)
    reservedCredits     Int                 @default(0)  // Créditos temporariamente retidos durante corte
    stripeCustomerId    String?             @unique
    image               String?
    plan                String              @default("STARTER") // "STARTER", "CREATOR", "PRO_STUDIO"
    subscription        Subscription?
    creditTransactions  CreditTransaction[]
    uploadedFiles       UploadedFile[]
    clips               Clip[]
}
```

### 3.3. Transações Contábeis (`CreditTransaction`)
Tipos permitidos:
- `"PURCHASE"`: Recarga avulsa de créditos.
- `"SUBSCRIPTION_RENEWAL"`: Recarregamento/reset da cota mensal na renovação da fatura.
- `"HOLD"`: Bloqueio temporário durante processamento de vídeo.
- `"CONSUME"`: Efetivação do gasto após sucesso na GPU.
- `"REFUND"`: Estorno por falha de processamento.

---

## 4. Integração com Stripe e Webhooks

### 4.1. Variáveis de Ambiente
```env
# Recargas Avulsas
STRIPE_SMALL_CREDIT_PACK="price_small_one_time"
STRIPE_MEDIUM_CREDIT_PACK="price_medium_one_time"
STRIPE_LARGE_CREDIT_PACK="price_large_one_time"

# Assinaturas Recorrentes (Mensais)
STRIPE_CREATOR_SUBSCRIPTION_PRICE="price_creator_monthly"
STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE="price_pro_studio_monthly"
```

### 4.2. Fluxo do Gateway de Pagamento (`StripePaymentGateway`)
1. `createCheckoutSession({ customerId, priceId, mode, successUrl, cancelUrl })`:
   - `mode: "subscription"` para os planos Creator e Pro Studio.
   - `mode: "payment"` para os pacotes Small, Medium e Large.
2. `createBillingPortalSession(customerId: string, returnUrl: string)`:
   - Invoca `stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })`.

### 4.3. Pipeline de Webhooks (Processado via Inngest)
No arquivo `src/app/api/webhooks/stripe/route.ts` e orquestrado no Inngest:

1. `checkout.session.completed`:
   - Se `mode === "payment"`: credita `oneTimeCredits` e adiciona ao saldo `credits`.
   - Se `mode === "subscription"`: busca a assinatura no Stripe, salva na tabela `Subscription` como `active`, define `user.plan = plan`, define `user.subscriptionCredits = monthlyCredits` e recalcula `user.credits`.
2. `invoice.payment_succeeded`:
   - Para faturas recorrentes de ciclo subsequente (renovação do mês):
   - Atualiza `currentPeriodStart` e `currentPeriodEnd`.
   - Executa a **Regra de Reset Mensal**:
     - `user.subscriptionCredits = subscription.monthlyCredits`
     - `user.credits = user.subscriptionCredits + user.oneTimeCredits`
   - Registra transação `SUBSCRIPTION_RENEWAL`.
3. `customer.subscription.updated`:
   - Sincroniza `cancel_at_period_end` (se o usuário marcou cancelamento pelo portal) e `status`.
4. `customer.subscription.deleted`:
   - Quando o período expira após o cancelamento:
   - `subscription.status = "canceled"`
   - `user.subscriptionCredits = 0`
   - `user.plan = "STARTER"`
   - `user.credits = user.oneTimeCredits`
5. `invoice.payment_failed`:
   - Marca `subscription.status = "past_due"`.
   - Dispara notificação no dashboard para atualização do cartão.

---

## 5. Regras de Domínio e Casos de Uso (Clean Architecture)

### 5.1. Regra de Consumo Prioritário (`HoldCreditsUseCase` e `ConsumeCreditsUseCase`)
Ao calcular e abater o custo de processamento de um vídeo ($C$ créditos):
1. **Validação:** Rejeita se $C > \text{user.credits}$.
2. **Abate Primário:**
   $$\text{debitSub} = \min(\text{user.subscriptionCredits}, C)$$
   $$\text{remaining} = C - \text{debitSub}$$
3. **Abate Secundário (Créditos Avulsos):**
   $$\text{debitOneTime} = \text{remaining}$$
4. **Atualização dos Saldos:**
   $$\text{user.subscriptionCredits} \leftarrow \text{user.subscriptionCredits} - \text{debitSub}$$
   $$\text{user.oneTimeCredits} \leftarrow \text{user.oneTimeCredits} - \text{debitOneTime}$$
   $$\text{user.credits} \leftarrow \text{user.subscriptionCredits} + \text{user.oneTimeCredits}$$

### 5.2. Novos Casos de Uso
- `ProcessSubscriptionCheckoutUseCase`: provisiona a assinatura no primeiro pagamento.
- `ProcessSubscriptionRenewalUseCase`: executa o reset da cota mensal no pagamento da fatura recorrente.
- `ExpireSubscriptionUseCase`: rebaixa para plano STARTER no cancelamento definitivo.
- `CreateBillingPortalSessionUseCase`: gera a URL do Stripe Customer Portal.

---

## 6. Interface do Usuário (`src/app/dashboard/billing/page.tsx`)

### 6.1. Componentes da Tela
1. **Resumo do Saldo (Header Transparente):**
   - Saldo Total de Créditos.
   - Detalhamento: Cota do mês (com data de renovação) e Créditos avulsos permanentes.
2. **Card de Assinatura Ativa (Condicional para Assinantes):**
   - Nome do plano atual, valor e data de expiração/renovação.
   - Botão em destaque com ícone externo: *"Gerenciar Assinatura (Portal Stripe)"*.
3. **Alternador Interativo de Abas (Tabs / Segmented Control):**
   - `[ 🔄 Planos Mensais (Até 38% OFF) ]`  |  `[ ⚡ Recargas Avulsas (Sem Validade) ]`
4. **Card do Pro Studio com Ancoragem de Preço:**
   - Destaque com borda dourada (`border-[var(--ouro)]`), selo *"Mais Popular"* e *"Economize 38%"*.
   - Preço riscado: `~~$79.99~~ $49.99 / mês`.
   - Destaque: *"Fila Ultra-Prioritária na GPU"*.
5. **Microcopy e Internacionalização:**
   - 100% em português brasileiro (pt-BR).
   - Cores e tokens alinhados ao tema Dark Precision Studio (`var(--marfim)`, `var(--tinta)`, `var(--ouro)`).

---

## 7. Estratégia de Testes

1. **Testes Unitários de Domínio:**
   - `tests/unit/domain/user-credits.test.ts`: testar consumo prioritário de créditos de assinatura antes dos avulsos, e cálculo de saldo total.
   - `tests/unit/application/credits/subscription-renewal.use-case.test.ts`: testar reset mensal e preservação de créditos avulsos.
   - `tests/unit/application/credits/expire-subscription.use-case.test.ts`: testar expiração e rebaixamento para STARTER.
2. **Testes do Gateway Stripe:**
   - `tests/unit/infrastructure/stripe-payment.gateway.test.ts`: testar criação de sessões em modo `subscription` e `payment`, e geração de URL do Customer Portal.
3. **Testes de Integração de Webhooks:**
   - `tests/unit/api/stripe-webhook.test.ts`: simular eventos `checkout.session.completed`, `invoice.payment_succeeded` e `customer.subscription.deleted`.
4. **Testes de Componente:**
   - `tests/unit/components/billing-page.test.tsx`: testar alternância de abas, renderização dos preços ancorados e botão do portal para assinantes.
