import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type { UserEntity } from "~/domain/entities/user";
import { CreditPricingService } from "~/domain/services/credit-pricing.service";
import { PlanCatalogService } from "~/application/services/plan-catalog.service";
import type { RevokeSubscriptionCreditsOutput } from "~/application/dtos/credits-dtos";

/**
 * Núcleo compartilhado por `ProcessChargeRefundUseCase` e
 * `ProcessChargeDisputeUseCase`: ambos reagem a um evento do Stripe que
 * devolveu dinheiro ao cliente (reembolso total/parcial ou disputa aberta)
 * revogando, proporcionalmente, os créditos de assinatura do período
 * afetado — sem suspender a conta (ver `AGENTS.md`/spec: só a expiração da
 * carência de `invoice.payment_failed` suspende a conta).
 *
 * Não é um Use Case em si (não tem `execute()` próprio nem factory): é um
 * helper de application layer reaproveitado pelos dois use cases públicos,
 * para não duplicar a lógica de cálculo proporcional e de atualização do
 * ledger.
 */
export async function revokeSubscriptionCreditsForChargeEvent(params: {
  userRepository: IUserRepository;
  subscriptionRepository: ISubscriptionRepository;
  creditTransactionRepository: ICreditTransactionRepository;
  unitOfWork: IUnitOfWork;
  userRecord: UserEntity;
  amountCents: number;
  transactionDescription: string;
}): Promise<RevokeSubscriptionCreditsOutput> {
  const {
    userRepository,
    subscriptionRepository,
    creditTransactionRepository,
    unitOfWork,
    userRecord,
    amountCents,
    transactionDescription,
  } = params;

  const subRecord = await subscriptionRepository.findByUserId(userRecord.id);

  const user = User.restore(userRecord);
  const monthlyCredits =
    subRecord?.monthlyCredits ??
    PlanCatalogService.getDefaultMonthlyCreditsForPlan(user.plan);
  const monthlyPriceCents = PlanCatalogService.getMonthlyPriceCentsForPlan(
    user.plan
  );

  const creditsToRevoke = CreditPricingService.calculateCreditsToRevokeForRefund(
    amountCents,
    monthlyPriceCents,
    monthlyCredits
  );

  if (creditsToRevoke <= 0) {
    return { success: false, userId: user.id, revokedCredits: 0 };
  }

  const revokedCredits = user.revokeSubscriptionCredits(creditsToRevoke);

  if (revokedCredits <= 0) {
    return { success: false, userId: user.id, revokedCredits: 0 };
  }

  await unitOfWork.execute(async () => {
    // `...Set` (não `...Decrement`) para refletir exatamente o estado já
    // recalculado pela entidade `User` a partir dos buckets
    // (subscriptionCredits + oneTimeCredits) — mesmo padrão usado por
    // `ExpireSubscriptionUseCase`/`ProcessSubscriptionRenewalUseCase`.
    await userRepository.updateCredits(user.id, {
      subscriptionCreditsSet: user.subscriptionCredits,
      creditsSet: user.credits,
    });

    await creditTransactionRepository.create({
      userId: user.id,
      amount: -revokedCredits,
      type: "REFUND",
      description: transactionDescription,
    });
  });

  return { success: true, userId: user.id, revokedCredits };
}
