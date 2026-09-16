# Especificação de Design: Assinaturas Recorrentes Mensais e Anuais (Opus Model)

- **Data:** 14 de Setembro de 2026 (Atualizado Setembro 2026 - Pivot Pricing)
- **Status:** Aprovado
- **Módulo:** Faturamento, Assinaturas e Gestão de Créditos (`billing`, `stripe`, `inngest`)
- **Arquitetura:** Clean Architecture / DDD / Dark Precision Studio Design System

---

## 1. Visão Geral e Objetivos

O SaaS agora utiliza uma estrutura de monetização 100% voltada a **Assinaturas Recorrentes (Mensais e Anuais)**, descartando o modelo anterior de pacotes avulsos (One-Time Packs). O modelo imita a precificação testada e aprovada pelo mercado americano (ex: Opus Clip).

1. **Assinaturas Recorrentes (Mensais e Anuais):** Planos com dois ciclos de cobrança. O plano anual exige pagamento integral upfront com desconto significativo (cerca de 30% a 38% OFF).
2. **Sem Validade de Créditos Mensais:** A definir pelas regras de negócio. (Normalmente "use-it-or-lose-it", mas adaptável).
3. **Estratégia de Ancoragem de Preço:** Destaque ao plano *Pro* ancorado como o melhor custo-benefício para "Clippers".
4. **Autoatendimento Seguro:** Portal do Cliente via Stripe para downgrade/upgrade e download de notas fiscais.

---

## 2. Estrutura de Planos e Preços

| Modalidade | Nome do Plano | Preço Mensal | Preço Anual | Créditos Inclusos |
| :--- | :--- | :---: | :---: | :--- |
| **Assinatura** | **Starter** | **$15.00 / mês** | **$9.50 / mês** ($114) | 150/mês (1.800/ano) |
| **Assinatura** | **Pro** *(Popular)* | **$29.00 / mês** | **$19.00 / mês** ($228) | 300/mês (3.600/ano) |
| **Assinatura** | **Enterprise** | **Custom** | **Custom** | Volume ilimitado (via Contato) |

---

## 3. Integração com Stripe e Webhooks

### 3.1. Variáveis de Ambiente Necessárias
```env
# Assinaturas Recorrentes (Mensais e Anuais)
STRIPE_STARTER_MONTHLY_PRICE_ID="price_starter_monthly"
STRIPE_STARTER_ANNUAL_PRICE_ID="price_starter_annual"
STRIPE_PRO_MONTHLY_PRICE_ID="price_pro_monthly"
STRIPE_PRO_ANNUAL_PRICE_ID="price_pro_annual"
```

### 3.2. Mapeamento no Backend (`src/actions/stripe.ts`)
O sistema mapeia chaves estáticas (`starter_monthly`, `starter_annual`, `pro_monthly`, `pro_annual`) para os respectivos `PRICE_IDS` do Stripe vindos das variáveis de ambiente (`env.ts`).

---

## 4. Interface do Usuário (`src/app/dashboard/billing/page.tsx` & `pricing-section.tsx`)

### 4.1. Componentes da Tela
1. **Alternador Interativo de Abas (Mensal / Anual):** 
   - No frontend da Landing Page, usa um botão do tipo Toggle (switch).
   - No Dashboard (Painel do Usuário), usa `PricingToggleTabs` (Segmented Control).
2. **Dinâmica de Exibição de Créditos (Anual):**
   - Ao selecionar o plano anual, a UI altera o número de créditos exibidos de mensais (ex: 300) para o consolidado anual (ex: 3.600 Créditos/ano) para aumentar a percepção de valor.

---

## 5. Estratégia de Testes Atualizada

Os testes unitários (`billing-page.test.tsx`) foram atualizados para validar o botão de toggle `Mensal/Anual`, além das chamadas corretas à `createCheckoutSession` com o `priceId` de cada ciclo selecionado (ex: `pro_annual`).
