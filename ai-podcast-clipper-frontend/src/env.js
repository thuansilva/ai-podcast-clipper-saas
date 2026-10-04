import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
    STORAGE_PROVIDER: z.enum(["s3", "local"]).default("s3"),
    PROCESS_VIDEO_ENDPOINT: z.string(),
    PROCESS_VIDEO_ENDPOINT_AUTH: z.string(),
    YOUTUBE_DOWNLOAD_ENDPOINT: z.string().optional(),
    STRIPE_SECRET_KEY: z.string(),

    // Planos de assinatura reais (únicos produtos vendidos hoje: Starter e
    // Pro, mensal ou anual — ver PlanCatalogService). Obrigatórios e sem
    // default "falso": um price ID incorreto/ausente deve falhar alto e
    // cedo, nunca cair num valor placeholder silencioso.
    STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().min(1),
    STRIPE_STARTER_ANNUAL_PRICE_ID: z.string().min(1),
    STRIPE_PRO_MONTHLY_PRICE_ID: z.string().min(1),
    STRIPE_PRO_ANNUAL_PRICE_ID: z.string().min(1),

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
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    PROCESS_VIDEO_ENDPOINT: process.env.PROCESS_VIDEO_ENDPOINT,
    PROCESS_VIDEO_ENDPOINT_AUTH: process.env.PROCESS_VIDEO_ENDPOINT_AUTH,
    YOUTUBE_DOWNLOAD_ENDPOINT: process.env.YOUTUBE_DOWNLOAD_ENDPOINT,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,

    // Planos de assinatura reais (Starter/Pro)
    STRIPE_STARTER_MONTHLY_PRICE_ID: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    STRIPE_STARTER_ANNUAL_PRICE_ID: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,

    // Deprecados (ver comentários acima, na seção `server`)
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
    STRIPE_SMALL_CREDIT_PACK: process.env.STRIPE_SMALL_CREDIT_PACK,

    BASE_URL: process.env.BASE_URL,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
