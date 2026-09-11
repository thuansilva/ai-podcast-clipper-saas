export interface CreateCheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
}

export interface IPaymentGateway {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<string>;
}
