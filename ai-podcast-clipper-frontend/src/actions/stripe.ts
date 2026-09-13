"use server";

import { redirect } from "next/navigation";
import { env } from "~/env";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { makeStripePaymentGateway } from "~/infrastructure/factories/use-case-factories";

export type PriceId = "small" | "medium" | "large";

const PRICE_IDS: Record<PriceId, string> = {
  small: env.STRIPE_SMALL_CREDIT_PACK,
  medium: env.STRIPE_MEDIUM_CREDIT_PACK,
  large: env.STRIPE_LARGE_CREDIT_PACK,
};

export async function createCheckoutSession(priceId: PriceId) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
    select: { stripeCustomerId: true },
  });

  if (!user.stripeCustomerId) {
    throw new Error("User has no stripeCustomerId");
  }

  const paymentGateway = makeStripePaymentGateway();
  const sessionUrl = await paymentGateway.createCheckoutSession({
    customerId: user.stripeCustomerId,
    priceId: PRICE_IDS[priceId],
    successUrl: `${env.BASE_URL}/dashboard?success=true`,
  });

  redirect(sessionUrl);
}
