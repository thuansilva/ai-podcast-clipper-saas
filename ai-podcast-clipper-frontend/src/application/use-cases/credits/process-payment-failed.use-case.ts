import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  ProcessPaymentFailedInput,
  ProcessPaymentFailedOutput,
} from "~/application/dtos/credits-dtos";

/**
 * Processa o webhook `invoice.payment_failed` do Stripe.
 *
 * Política de negócio: reage imediatamente à falha de cobrança marcando a
 * assinatura como "past_due" e registrando o início da carência
 * (`pastDueAt`), SEM revogar créditos/acesso nesse momento — o usuário
 * mantém o uso normal durante os 3 dias de carência (ver
 * `SuspendExpiredPastDueSubscriptionsUseCase`, que roda periodicamente e
 * suspende a conta se a carência expirar sem um `invoice.payment_succeeded`
 * subsequente resolvendo o problema).
 */
export class ProcessPaymentFailedUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: ProcessPaymentFailedInput
  ): Promise<ProcessPaymentFailedOutput> {
    const userRecord = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!userRecord) {
      throw new NotFoundError(
        "Usuário com Stripe Customer ID",
        input.stripeCustomerId
      );
    }

    const subRecord = input.stripeSubscriptionId
      ? await this.subscriptionRepository.findByStripeSubscriptionId(
          input.stripeSubscriptionId
        )
      : await this.subscriptionRepository.findByUserId(userRecord.id);

    if (!subRecord) {
      // Não há Subscription persistida para marcar past_due (ex.: cliente
      // sem assinatura ativa registrada). Nada a fazer além de confirmar o
      // processamento do evento — não é um erro, apenas não há estado de
      // assinatura para transicionar.
      return {
        success: false,
        userId: userRecord.id,
        subscriptionStatus: "unknown",
      };
    }

    await this.unitOfWork.execute(async () => {
      await this.subscriptionRepository.update(
        subRecord.stripeSubscriptionId,
        {
          status: "past_due",
          pastDueAt: new Date(),
        }
      );
    });

    return {
      success: true,
      userId: userRecord.id,
      subscriptionStatus: "past_due",
    };
  }
}
