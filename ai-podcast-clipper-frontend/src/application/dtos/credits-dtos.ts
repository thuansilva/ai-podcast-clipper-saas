export interface HoldCreditsInput {
  userId: string;
  durationSeconds: number;
  fileId: string;
}

export interface HoldCreditsOutput {
  success: boolean;
  heldCredits: number;
}

export interface ConsumeCreditsInput {
  userId: string;
  amount: number;
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
  smallPackPriceId: string;
  mediumPackPriceId: string;
  largePackPriceId: string;
}

export interface AddCreditsFromStripeOutput {
  success: boolean;
  addedCredits: number;
  userId: string;
}
