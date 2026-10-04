export interface SubscriptionEntity {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  plan: string;
  monthlyCredits: number;
  /**
   * Instante em que a assinatura entrou em carência por falha de pagamento
   * (`invoice.payment_failed`). `null`/`undefined` quando nunca esteve em
   * carência ou quando a carência foi resolvida.
   */
  pastDueAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSubscriptionData {
  userId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  plan: string;
  monthlyCredits: number;
}

export interface UpdateSubscriptionData {
  status?: string;
  stripePriceId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  plan?: string;
  monthlyCredits?: number;
  /** `null` limpa explicitamente a carência (ex.: ao resolver past_due). */
  pastDueAt?: Date | null;
}

export interface ISubscriptionRepository {
  findByUserId(userId: string): Promise<SubscriptionEntity | null>;
  findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionEntity | null>;
  upsert(data: UpsertSubscriptionData): Promise<SubscriptionEntity>;
  update(
    stripeSubscriptionId: string,
    data: UpdateSubscriptionData
  ): Promise<SubscriptionEntity>;
  /**
   * Retorna todas as assinaturas com status "past_due" cuja carência
   * (`pastDueAt`) começou antes do `cutoff` informado — ou seja, já
   * excedeu a janela de carência e deve ser suspensa (ver
   * `SuspendExpiredPastDueSubscriptionsUseCase`).
   */
  findPastDueOlderThan(cutoff: Date): Promise<SubscriptionEntity[]>;
}
