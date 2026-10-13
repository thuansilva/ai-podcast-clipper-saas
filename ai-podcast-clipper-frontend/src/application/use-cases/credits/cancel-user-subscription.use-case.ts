import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import type { ExpireSubscriptionUseCase } from "~/application/use-cases/credits/expire-subscription.use-case";
import { logger } from "~/lib/observability/logger";

export interface CancelUserSubscriptionInput {
  userId: string;
}

/**
 * Cancela a assinatura Stripe ativa de um usuário (se houver) e expira os
 * créditos de assinatura correspondentes.
 *
 * Extraído de `DeleteUserAccountUseCase` para que a ação de cancelamento de
 * cobrança (dinheiro) possa ser confirmada de forma síncrona no momento em
 * que o usuário clica em "excluir conta" (`src/actions/delete-account.ts`),
 * em vez de depender só do webhook `user.deleted` do Clerk, que pode
 * atrasar ou falhar.
 *
 * Idempotente: sem assinatura, ou assinatura já `canceled`, é um no-op. O
 * `IPaymentGateway.cancelSubscription` já tolera assinatura inexistente no
 * Stripe (ver `StripePaymentGateway.cancelSubscription`), então chamar este
 * Use Case mais de uma vez para o mesmo usuário (ex.: uma vez na action, uma
 * vez no webhook de segurança) não tem efeitos colaterais adicionais.
 */
export class CancelUserSubscriptionUseCase {
  constructor(
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly expireSubscriptionUseCase: ExpireSubscriptionUseCase
  ) {}

  async execute(input: CancelUserSubscriptionInput): Promise<void> {
    const subscription = await this.subscriptionRepository.findByUserId(
      input.userId
    );

    if (!subscription || subscription.status === "canceled") {
      return;
    }

    try {
      await this.paymentGateway.cancelSubscription(
        subscription.stripeSubscriptionId
      );
    } catch (error) {
      logger.error("Failed to cancel Stripe subscription", {
        userId: input.userId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        error,
      });
      throw error;
    }

    await this.expireSubscriptionUseCase.execute({ userId: input.userId });
  }
}
