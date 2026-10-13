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
  /**
   * Cancela a assinatura no provedor de pagamento (ex.: exclusão de conta,
   * ver `DeleteUserAccountUseCase`). Implementações devem tratar o caso de
   * a assinatura já não existir no provedor (ex.: já cancelada antes) sem
   * lançar erro fatal.
   */
  cancelSubscription(stripeSubscriptionId: string): Promise<void>;
}
