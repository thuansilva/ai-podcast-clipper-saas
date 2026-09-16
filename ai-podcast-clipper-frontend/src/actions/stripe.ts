"use server";

import { redirect } from "next/navigation";
import { env } from "~/env";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeStripePaymentGateway,
  makeUserRepository,
  makeGetUserBillingDataUseCase,
} from "~/infrastructure/factories/use-case-factories";
import { NotFoundError } from "~/domain/errors/not-found-error";
import { DomainError } from "~/domain/errors/domain-error";

export type SubscriptionPlanId = "starter" | "pro";
export type BillingCycle = "monthly" | "annual";
export type PriceId = `${SubscriptionPlanId}_${BillingCycle}`;

const PRICE_IDS: Record<PriceId, string> = {
  starter_monthly: env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  starter_annual: env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  pro_monthly: env.STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_annual: env.STRIPE_PRO_ANNUAL_PRICE_ID,
};

export interface CreateCheckoutSessionOptions {
  priceId: string;
  mode?: "payment" | "subscription";
}

export async function createCheckoutSession(
  priceIdOrOptions: string | CreateCheckoutSessionOptions,
  explicitMode?: "payment" | "subscription"
) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await makeUserRepository().findById(userId);
  if (!user) {
    throw new NotFoundError("Usuário", userId);
  }

  if (!user.stripeCustomerId) {
    throw new DomainError("User has no stripeCustomerId");
  }

  let priceIdKey: string;
  let mode: "payment" | "subscription" | undefined;

  if (typeof priceIdOrOptions === "object" && priceIdOrOptions !== null) {
    priceIdKey = priceIdOrOptions.priceId;
    mode = priceIdOrOptions.mode;
  } else {
    priceIdKey = priceIdOrOptions;
    mode = explicitMode;
  }

  // All plans are subscriptions now
  const resolvedMode: "payment" | "subscription" = mode ?? "subscription";

  const resolvedPriceId =
    priceIdKey in PRICE_IDS
      ? PRICE_IDS[priceIdKey as PriceId]
      : priceIdKey;

  const paymentGateway = makeStripePaymentGateway();
  const sessionUrl = await paymentGateway.createCheckoutSession({
    customerId: user.stripeCustomerId,
    priceId: resolvedPriceId,
    mode: resolvedMode,
    successUrl: `${env.BASE_URL}/dashboard?success=true`,
    cancelUrl: `${env.BASE_URL}/dashboard/billing?canceled=true`,
  });

  redirect(sessionUrl);
}

export async function createCustomerPortalSession(returnUrl?: string) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await makeUserRepository().findById(userId);
  if (!user) {
    throw new NotFoundError("Usuário", userId);
  }

  if (!user.stripeCustomerId) {
    throw new DomainError("User has no stripeCustomerId");
  }

  const paymentGateway = makeStripePaymentGateway();
  const portalUrl = await paymentGateway.createBillingPortalSession({
    customerId: user.stripeCustomerId,
    returnUrl: returnUrl ?? `${env.BASE_URL}/dashboard/billing`,
  });

  redirect(portalUrl);
}

// Aliases para compatibilidade com a especificação e diferentes padrões de nomenclatura
export const createCheckoutSessionAction = createCheckoutSession;
export const createCustomerPortalSessionAction = createCustomerPortalSession;
export const createPortalSession = createCustomerPortalSession;

export interface UserBillingData {
  credits: number;
  subscriptionCredits: number;
  oneTimeCredits: number; // Keeping this field as older users might still have one-time credits they bought
  plan?: string;
  subscription?: {
    id?: string;
    plan: string;
    status: string;
    monthlyCredits?: number;
    currentPeriodStart?: Date | string;
    currentPeriodEnd?: Date | string;
    cancelAtPeriodEnd?: boolean;
  } | null;
}

export async function getUserBillingData(): Promise<UserBillingData | null> {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return null;
  }

  const useCase = makeGetUserBillingDataUseCase();
  return await useCase.execute(userId);
}
