import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ISubscriptionRepository } from "~/domain/ports/subscription-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  ResolvePastDueGracePeriodInput,
  ResolvePastDueGracePeriodOutput,
} from "~/application/dtos/credits-dtos";

/**
 * Reação imediata (síncrona) a um `invoice.payment_succeeded` que chega
 * enquanto a assinatura está em carência (`past_due`): limpa o status de
 * volta para "active" e zera `pastDueAt` no mesmo instante em que o
 * webhook é recebido, cumprindo a política de negócio de cancelar a
 * suspensão pendente sem esperar o worker assíncrono.
 *
 * Deliberadamente NÃO toca em créditos/`monthlyCredits` — isso continua
 * sendo responsabilidade exclusiva de `ProcessSubscriptionRenewalUseCase`
 * (que já zera `pastDueAt`/define "active" por conta própria, de forma
 * assíncrona via Inngest). Rodar os dois em sequência é seguro e
 * idempotente: ambos só escrevem os mesmos campos de status, nunca
 * duplicam efeito sobre o saldo de créditos. Ver `route.ts` para onde
 * este use case é chamado antes do dispatch assíncrono da renovação.
 *
 * Também é deliberadamente tolerante (nunca lança) a usuário/assinatura
 * não encontrados ou já fora de carência — é um passo auxiliar de UX, não
 * a via principal de processamento do pagamento, que tem seu próprio
 * tratamento de erro em `ProcessSubscriptionRenewalUseCase`.
 */
export class ResolvePastDueGracePeriodUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: ResolvePastDueGracePeriodInput
  ): Promise<ResolvePastDueGracePeriodOutput> {
    const userRecord = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!userRecord) {
      return { resolved: false };
    }

    const subRecord = input.stripeSubscriptionId
      ? await this.subscriptionRepository.findByStripeSubscriptionId(
          input.stripeSubscriptionId
        )
      : await this.subscriptionRepository.findByUserId(userRecord.id);

    if (!subRecord || subRecord.status !== "past_due") {
      return { resolved: false };
    }

    await this.unitOfWork.execute(async () => {
      await this.subscriptionRepository.update(
        subRecord.stripeSubscriptionId,
        {
          status: "active",
          pastDueAt: null,
        }
      );
    });

    return { resolved: true };
  }
}
