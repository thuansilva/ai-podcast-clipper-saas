import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type {
  AddCreditsFromStripeInput,
  AddCreditsFromStripeOutput,
} from "~/application/dtos/credits-dtos";

/**
 * Pacotes avulsos de créditos (small/medium/large) foram descontinuados
 * como produto (decisão de negócio: apenas assinaturas Starter/Pro
 * continuam sendo vendidas — ver `PlanCatalogService`). Este use case é
 * mantido apenas porque a infraestrutura de fila/Inngest ainda despacha o
 * evento legado "stripe/checkout.completed" para sessões de checkout que
 * não são de assinatura; ele nunca mais adiciona créditos, só garante que
 * o cliente Stripe exista (evitando erro silencioso) e retorna
 * `success: false`.
 */
export class AddCreditsFromStripeWebhookUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(
    input: AddCreditsFromStripeInput
  ): Promise<AddCreditsFromStripeOutput> {
    const userRecord = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!userRecord) {
      throw new NotFoundError(
        "Usuário com Stripe Customer ID",
        input.stripeCustomerId
      );
    }

    return { success: false, addedCredits: 0, userId: userRecord.id };
  }
}
