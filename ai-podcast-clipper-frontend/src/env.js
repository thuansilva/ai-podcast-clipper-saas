import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { assertInngestProductionEnv } from "./inngest-env-guard.js";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_REGION: z.string(),
    S3_BUCKET_NAME: z.string(),
    S3_ENDPOINT_URL: z.string().url().optional(),
    STORAGE_PROVIDER: z.enum(["s3", "minio"]).default("s3"),
    PROCESS_VIDEO_ENDPOINT: z.string(),
    AUTH_TOKEN: z.string(),
    YOUTUBE_DOWNLOAD_ENDPOINT: z.string().optional(),
    STRIPE_SECRET_KEY: z.string(),

    // Planos de assinatura reais (únicos produtos vendidos hoje: Starter e
    // Pro, mensal ou anual — ver PlanCatalogService). Obrigatórios e sem
    // default "falso": um price ID incorreto/ausente deve falhar alto e
    // cedo, nunca cair num valor placeholder silencioso.
    STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY: z.string().min(1),
    STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL: z.string().min(1),
    STRIPE_PRICE_ID_PLAN_PRO_MONTHLY: z.string().min(1),
    STRIPE_PRICE_ID_PLAN_PRO_ANNUAL: z.string().min(1),

    /**
     * @deprecated Taxonomia legada de planos ("Creator"/"Pro Studio"),
     * substituída por Starter/Pro (ver PlanCatalogService). Não é mais
     * usada para resolver plano/créditos em nenhum fluxo de produção;
     * mantida apenas porque ainda é referenciada por testes legados que
     * documentam o comportamento antigo. Pode ser removida quando esses
     * testes forem desativados.
     */
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: z.string().default("price_creator_deprecated"),
    /** @deprecated Ver `STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID`. */
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: z.string().default("price_pro_studio_deprecated"),

    /**
     * @deprecated Pacotes avulsos de créditos foram descontinuados como
     * produto — apenas assinaturas Starter/Pro são vendidas. Mantida só
     * para compatibilidade com testes que verificam a rejeição explícita
     * de price IDs de produtos descontinuados.
     */
    STRIPE_SMALL_CREDIT_PACK: z.string().default("price_small_deprecated"),

    BASE_URL: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),

    // Inngest (RNF-SEC-04). Opcionais no schema porque dev local roda sem
    // Inngest Cloud; em NODE_ENV=production a obrigatoriedade (e a
    // proibição de INNGEST_DEV) é aplicada por `assertInngestProductionEnv`
    // logo abaixo do `createEnv`.
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    INNGEST_DEV: z.string().optional(),

    // Upstash Redis (rate limiting com estado compartilhado entre
    // instâncias/serverless). Opcionais: sem elas, a factory de rate
    // limiters (`rate-limiter-factory.ts`) cai para
    // `InMemorySlidingWindowRateLimiter` (comportamento de hoje, só
    // per-instância) em vez de falhar — é o esperado em dev/CI, que não têm
    // uma conta Upstash configurada.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/login"),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/signup"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
  },

  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_ENDPOINT_URL: process.env.S3_ENDPOINT_URL,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    PROCESS_VIDEO_ENDPOINT: process.env.PROCESS_VIDEO_ENDPOINT,
    AUTH_TOKEN: process.env.AUTH_TOKEN,
    YOUTUBE_DOWNLOAD_ENDPOINT: process.env.YOUTUBE_DOWNLOAD_ENDPOINT,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,

    // Planos de assinatura reais (Starter/Pro)
    STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY: process.env.STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY,
    STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL: process.env.STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL,
    STRIPE_PRICE_ID_PLAN_PRO_MONTHLY: process.env.STRIPE_PRICE_ID_PLAN_PRO_MONTHLY,
    STRIPE_PRICE_ID_PLAN_PRO_ANNUAL: process.env.STRIPE_PRICE_ID_PLAN_PRO_ANNUAL,

    // Deprecados (ver comentários acima, na seção `server`)
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
    STRIPE_SMALL_CREDIT_PACK: process.env.STRIPE_SMALL_CREDIT_PACK,

    BASE_URL: process.env.BASE_URL,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    INNGEST_DEV: process.env.INNGEST_DEV,

    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

// Validação cruzada que o schema por variável não expressa ("obrigatória só
// em produção"). Roda no mesmo momento que o `createEnv` (next build via
// next.config.js e boot do servidor) e respeita o mesmo SKIP_ENV_VALIDATION.
// Lê de `process.env` (e não do objeto `env`) porque, no client, o proxy do
// `env` lança ao acessar variáveis de servidor.
if (!process.env.SKIP_ENV_VALIDATION && typeof window === "undefined") {
  assertInngestProductionEnv({
    NODE_ENV: process.env.NODE_ENV,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    INNGEST_DEV: process.env.INNGEST_DEV,
  });
}
