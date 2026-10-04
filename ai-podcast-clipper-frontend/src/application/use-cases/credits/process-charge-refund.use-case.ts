import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  ProcessChargeRefundInput,
  RevokeSubscriptionCreditsOutput,
} from "~/application/dtos/credits-dtos";
import { revokeSubscriptionCreditsForChargeEvent } from "~/application/use-cases/credits/revoke-subscription-credits.helper";

/**
 * Processa o webhook `charge.refunded` do Stripe.
 *
 * Política de negócio: revoga somente os créditos de assinatura
 * proporcionais ao valor reembolsado do período de cobrança afetado —
 * créditos avulsos (`oneTimeCredits`) nunca são tocados, e a conta
 * permanece ativa (reembolso não é motivo de suspensão, diferente da
 * carência expirada de `invoice.payment_failed`).
 */
export class ProcessChargeRefundUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: ProcessChargeRefundInput
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
      amountCents: input.refundAmountCents,
      transactionDescription: `Revogação de créditos de assinatura referente a reembolso do Stripe${
        input.chargeId ? ` (charge ${input.chargeId})` : ""
      }${input.invoiceId ? ` [invoice:${input.invoiceId}]` : ""}`,
    });
  }
}
