import { z } from "zod";

/**
 * Chaves reais de plano confirmadas em `src/actions/stripe.ts` (`PRICE_IDS`), que
 * mapeiam cada chave para um price id de ambiente (`env.STRIPE_*_PRICE_ID`).
 *
 * Antes desta validação, `createCheckoutSession` usava a string recebida do
 * cliente como price id real sempre que ela não batia com uma destas 4 chaves —
 * ou seja, qualquer `priceId` arbitrário vindo de um `curl` direto na Server Action
 * era repassado como price id ao Stripe. Restringir com `z.enum` fecha esse gap:
 * nenhum valor fora destas 4 chaves chega a ser resolvido em price id.
 */
export const STRIPE_PRICE_ID_KEYS = [
  "starter_monthly",
  "starter_annual",
  "pro_monthly",
  "pro_annual",
] as const;

export const createCheckoutSessionSchema = z.object({
  priceId: z.enum(STRIPE_PRICE_ID_KEYS, {
    errorMap: () => ({
      message: `Plano inválido. Use um dos seguintes: ${STRIPE_PRICE_ID_KEYS.join(", ")}.`,
    }),
  }),
  mode: z.enum(["payment", "subscription"]).optional(),
});

/**
 * Apenas paths relativos iniciados por "/" são aceitos, para evitar open redirect
 * via `return_url` do Stripe Billing Portal. Rejeita:
 * - URL absoluta (`https://evil.com`) e esquemas (`javascript:`), por não começar com "/";
 * - protocol-relative (`//evil.com`);
 * - qualquer barra invertida (`/\evil.com`), que navegadores normalizam para "//";
 * - espaços/caracteres de controle (TAB, CR, LF), que navegadores removem do meio
 *   da URL (`/<TAB>/evil.com` vira `//evil.com`).
 *
 * Defesa em profundidade: a action ancora o path no `BASE_URL` da aplicação (o
 * Stripe exige URL absoluta) e confere que a origem resultante é a do `BASE_URL`.
 */
export const RELATIVE_RETURN_PATH_REGEX = /^\/(?!\/)[^\\\s\x00-\x1f\x7f]*$/;

export const createCustomerPortalSessionSchema = z.object({
  returnUrl: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(
      RELATIVE_RETURN_PATH_REGEX,
      'returnUrl deve ser um caminho relativo iniciado por "/".'
    )
    .optional(),
});
