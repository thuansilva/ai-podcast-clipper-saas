import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  ProcessChargeDisputeInput,
  RevokeSubscriptionCreditsOutput,
} from "~/application/dtos/credits-dtos";
import { revokeSubscriptionCreditsForChargeEvent } from "~/application/use-cases/credits/revoke-subscription-credits.helper";

/**
 * Processa o webhook `charge.dispute.created` do Stripe.
 *
 * Política de negócio: mesmo comportamento de `charge.refunded` — revoga
 * proporcionalmente os créditos de assinatura do período contestado, sem
 * suspender a conta (a disputa ainda pode ser vencida pelo lojista; a
 * suspensão só ocorre via carência de `invoice.payment_failed` expirada).
 */
export class ProcessChargeDisputeUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: ProcessChargeDisputeInput
  ): Promise<RevokeSubscriptionCreditsOutput> {
    const userRecord = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!userRecord) {
      throw new NotFoundError(
        "Usuário com Stripe Customer ID",
        input.stripeCustomerId
      );
    }

    return revokeSubscriptionCreditsForChargeEvent({
      userRepository: this.userRepository,
      subscriptionRepository: this.subscriptionRepository,
      creditTransactionRepository: this.creditTransactionRepository,
      unitOfWork: this.unitOfWork,
      userRecord,
      amountCents: input.disputeAmountCents,
      transactionDescription: `Revogação de créditos de assinatura referente a disputa (chargeback) aberta no Stripe${
        input.chargeId ? ` (charge ${input.chargeId})` : ""
      }`,
    });
  }
}
