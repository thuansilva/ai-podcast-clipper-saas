import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  SuspendExpiredPastDueSubscriptionsInput,
  SuspendExpiredPastDueSubscriptionsOutput,
} from "~/application/dtos/credits-dtos";

const DEFAULT_GRACE_PERIOD_DAYS = 3;

/**
 * Suspende contas cuja assinatura está "past_due" há mais do que a janela
 * de carência (3 dias por padrão) sem um `invoice.payment_succeeded`
 * subsequente resolvendo a pendência.
 *
 * Pensado para ser executado periodicamente por uma função Inngest
 * agendada (cron) — ver `suspendExpiredPastDueSubscriptions` em
 * `src/inngest/functions.ts` — em vez de aguardar o dunning assíncrono do
 * próprio Stripe, cumprindo a política de negócio de reagir à falha de
 * pagamento (`ProcessPaymentFailedUseCase`) e, 3 dias depois sem
 * resolução, revogar o acesso.
 */
export class SuspendExpiredPastDueSubscriptionsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: SuspendExpiredPastDueSubscriptionsInput = {}
  ): Promise<SuspendExpiredPastDueSubscriptionsOutput> {
    const graceDays = input.graceDays ?? DEFAULT_GRACE_PERIOD_DAYS;
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

    const expiredSubscriptions =
      await this.subscriptionRepository.findPastDueOlderThan(cutoff);

    let suspendedCount = 0;

    for (const subscription of expiredSubscriptions) {
      const userRecord = await this.userRepository.findById(
        subscription.userId
      );
      if (!userRecord) {
        continue;
      }

      const user = User.restore(userRecord);
      user.suspendForNonPayment();

      await this.unitOfWork.execute(async () => {
        await this.userRepository.updateCredits(user.id, {
          subscriptionCreditsSet: 0,
          oneTimeCreditsSet: 0,
          creditsSet: 0,
        });

        await this.userRepository.update(user.id, { plan: user.plan });

        await this.subscriptionRepository.update(
          subscription.stripeSubscriptionId,
          {
            status: "canceled",
            pastDueAt: null,
          }
        );
      });

      suspendedCount++;
    }

    return { suspendedCount };
  }
}
