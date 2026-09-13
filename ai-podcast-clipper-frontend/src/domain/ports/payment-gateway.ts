export interface CreateCheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
}

export interface IPaymentGateway {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<string>;
  createCustomer(email: string, name?: string | null): Promise<string>;
}
