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
    
    // New Pricing Plans
    STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().default("price_starter_monthly"),
    STRIPE_STARTER_ANNUAL_PRICE_ID: z.string().default("price_starter_annual"),
    STRIPE_PRO_MONTHLY_PRICE_ID: z.string().default("price_pro_monthly"),
    STRIPE_PRO_ANNUAL_PRICE_ID: z.string().default("price_pro_annual"),
    STRIPE_SMALL_CREDIT_PACK: z.string().default("price_small"),
    STRIPE_MEDIUM_CREDIT_PACK: z.string().default("price_medium"),
    STRIPE_LARGE_CREDIT_PACK: z.string().default("price_large"),
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: z.string().default("price_creator"),
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: z.string().default("price_pro_studio"),
    
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
    
    // New Pricing Plans mapping
    STRIPE_STARTER_MONTHLY_PRICE_ID: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    STRIPE_STARTER_ANNUAL_PRICE_ID: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    STRIPE_SMALL_CREDIT_PACK: process.env.STRIPE_SMALL_CREDIT_PACK,
    STRIPE_MEDIUM_CREDIT_PACK: process.env.STRIPE_MEDIUM_CREDIT_PACK,
    STRIPE_LARGE_CREDIT_PACK: process.env.STRIPE_LARGE_CREDIT_PACK,
    STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID,
    STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID,
    
    BASE_URL: process.env.BASE_URL,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
