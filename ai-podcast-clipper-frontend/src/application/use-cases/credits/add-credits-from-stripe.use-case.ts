import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  AddCreditsFromStripeInput,
  AddCreditsFromStripeOutput,
} from "~/application/dtos/credits-dtos";

export class AddCreditsFromStripeWebhookUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(
    input: AddCreditsFromStripeInput
  ): Promise<AddCreditsFromStripeOutput> {
    const user = await this.userRepository.findByStripeCustomerId(
      input.stripeCustomerId
    );
    if (!user) {
      throw new NotFoundError(
        "Usuário com Stripe Customer ID",
        input.stripeCustomerId
      );
    }

    let creditsToAdd = 0;
    if (input.priceId === input.smallPackPriceId) {
      creditsToAdd = 50;
    } else if (input.priceId === input.mediumPackPriceId) {
      creditsToAdd = 150;
    } else if (input.priceId === input.largePackPriceId) {
      creditsToAdd = 500;
    }

    if (creditsToAdd === 0) {
      return { success: false, addedCredits: 0, userId: user.id };
    }

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(user.id, {
        creditsIncrement: creditsToAdd,
      });

      if (input.priceId === input.largePackPriceId) {
        await this.userRepository.update(user.id, { plan: "STUDIO" });
      }

      await this.creditTransactionRepository.create({
        userId: user.id,
        amount: creditsToAdd,
        type: "PURCHASE",
        description: `Compra de pacote de ${creditsToAdd} créditos via Stripe`,
      });
    });

    return {
      success: true,
      addedCredits: creditsToAdd,
      userId: user.id,
    };
  }
}
