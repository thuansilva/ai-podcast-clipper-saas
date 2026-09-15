export interface CreateCheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
  mode?: "payment" | "subscription";
  cancelUrl?: string;
}

export interface CreateBillingPortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface IPaymentGateway {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<string>;
  createBillingPortalSession(
    input: CreateBillingPortalSessionInput
  ): Promise<string>;
  createCustomer(email: string, name?: string | null): Promise<string>;
}
