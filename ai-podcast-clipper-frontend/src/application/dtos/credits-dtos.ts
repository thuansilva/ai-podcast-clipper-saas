export interface HoldCreditsInput {
  userId: string;
  durationSeconds: number;
  fileId: string;
  amount?: number;
}

export interface HoldCreditsOutput {
  success: boolean;
  heldCredits: number;
}

export interface ConsumeCreditsInput {
  userId: string;
  amount: number;
  heldAmount?: number;
  fileId: string;
}

export interface RefundCreditsInput {
  userId: string;
  amount: number;
  fileId: string;
  reason: string;
}

export interface AddCreditsFromStripeInput {
  stripeCustomerId: string;
  priceId: string;
}

export interface AddCreditsFromStripeOutput {
  success: boolean;
  addedCredits: number;
  userId: string;
}

export interface ProcessPaymentFailedInput {
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
}

export interface ProcessPaymentFailedOutput {
  success: boolean;
  userId: string;
  subscriptionStatus: string;
}

export interface ProcessChargeRefundInput {
  stripeCustomerId: string;
  refundAmountCents: number;
  chargeId?: string;
  invoiceId?: string;
}

export interface ProcessChargeDisputeInput {
  stripeCustomerId: string;
  disputeAmountCents: number;
  chargeId?: string;
}

export interface RevokeSubscriptionCreditsOutput {
  success: boolean;
  userId: string;
  revokedCredits: number;
}

export interface SuspendExpiredPastDueSubscriptionsInput {
  graceDays?: number;
}

export interface SuspendExpiredPastDueSubscriptionsOutput {
  suspendedCount: number;
}

export interface ResolvePastDueGracePeriodInput {
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
}

export interface ResolvePastDueGracePeriodOutput {
  resolved: boolean;
}
