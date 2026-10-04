import { env } from "~/env";
import { InvalidPriceIdError } from "~/domain/errors/invalid-price-id-error";
import type { UserPlan } from "~/domain/entities/user";

export type BillingPeriod = "monthly" | "annual";

export interface PlanCatalogEntry {
  plan: UserPlan;
  billingPeriod: BillingPeriod;
  /**
   * Créditos atribuídos quando esse price ID é processado:
   * cota mensal recorrente para planos mensais, lump sum único para planos
   * anuais (ver decisão de produto: "créditos do plano anual em lump sum").
   */
  credits: number;
}

/**
 * PlanCatalog: fonte única da verdade para o mapeamento
 * `Stripe priceId -> { plano, periodicidade, créditos }`.
 *
 * Mantém os 4 price IDs reais e ativos (`src/env.js`) como as únicas chaves
 * válidas. Qualquer price ID fora desse catálogo (desconhecido ou de um
 * produto descontinuado, ex.: pacotes avulsos de créditos) deve lançar
 * `InvalidPriceIdError` explicitamente — nunca cair em um fallback
 * silencioso de plano/créditos.
 */
function buildPlanCatalog(): Map<string, PlanCatalogEntry> {
  return new Map<string, PlanCatalogEntry>([
    [
      env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      { plan: "STARTER", billingPeriod: "monthly", credits: 150 },
    ],
    [
      env.STRIPE_STARTER_ANNUAL_PRICE_ID,
      { plan: "STARTER", billingPeriod: "annual", credits: 1800 },
    ],
    [
      env.STRIPE_PRO_MONTHLY_PRICE_ID,
      { plan: "PRO", billingPeriod: "monthly", credits: 300 },
    ],
    [
      env.STRIPE_PRO_ANNUAL_PRICE_ID,
      { plan: "PRO", billingPeriod: "annual", credits: 3600 },
    ],
  ]);
}

export const PlanCatalogService = {
  /**
   * Resolve um `priceId` do Stripe para o plano/créditos correspondentes.
   * Lança `InvalidPriceIdError` se o price ID não for um dos 4 planos
   * ativos (Starter/Pro x Mensal/Anual).
   */
  resolveByPriceId(priceId: string): PlanCatalogEntry {
    const catalog = buildPlanCatalog();
    const entry = catalog.get(priceId);
    if (!entry) {
      throw new InvalidPriceIdError(priceId);
    }
    return entry;
  },

  /**
   * Créditos mensais "de referência" de um plano, usados apenas como
   * fallback de última instância quando não há price ID disponível (ex.:
   * renovação de assinatura sem registro de `Subscription` persistido).
   * Não contempla o lump sum anual — esse valor só é conhecido via
   * `resolveByPriceId`.
   */
  getDefaultMonthlyCreditsForPlan(plan: UserPlan): number {
    return plan === "PRO" ? 300 : 150;
  },

  /**
   * Preço mensal "de referência" (em centavos de dólar) de cada plano,
   * conforme a estrutura de preços documentada em
   * `docs/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`
   * (Starter: $15,00/mês; Pro: $29,00/mês). Usado apenas para calcular a
   * fração de créditos de assinatura a revogar quando o Stripe reembolsa
   * ou disputa uma cobrança (ver `CreditPricingService.calculateCreditsToRevokeForRefund`)
   * — não reflete descontos/promoções pontuais nem o preço anual (lump sum).
   */
  getMonthlyPriceCentsForPlan(plan: UserPlan): number {
    return plan === "PRO" ? 2900 : 1500;
  },
};
