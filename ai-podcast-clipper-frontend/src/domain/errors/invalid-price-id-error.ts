import { DomainError } from "./domain-error";

/**
 * Lançado quando um webhook do Stripe (checkout/assinatura) chega com um
 * `priceId` que não corresponde a nenhum dos planos ativos do catálogo
 * (`PlanCatalog`). Nunca deve haver fallback silencioso para um plano
 * "padrão" — um price ID desconhecido é sempre um erro explícito, seja
 * porque o produto foi descontinuado (ex.: pacotes avulsos de créditos),
 * seja porque o catálogo de planos ficou desatualizado em relação ao
 * Stripe.
 */
export class InvalidPriceIdError extends DomainError {
  constructor(priceId: string) {
    super(
      `Price ID do Stripe não reconhecido: "${priceId}". Verifique se o produto ainda está ativo no PlanCatalog ou se as variáveis de ambiente de price ID estão corretas.`
    );
  }
}
