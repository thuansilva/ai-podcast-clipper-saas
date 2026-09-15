import { NotFoundError } from "~/domain/errors/not-found-error";
import { User } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type { ConsumeCreditsInput } from "~/application/dtos/credits-dtos";

export class ConsumeCreditsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(input: ConsumeCreditsInput): Promise<{ success: boolean }> {
    const userRecord = await this.userRepository.findById(input.userId);
    if (!userRecord) {
      throw new NotFoundError("Usuário", input.userId);
    }

    const user = User.restore(userRecord);

    const hasUnusedHeld =
      input.heldAmount !== undefined && input.heldAmount > input.amount;
    const requestedUnused = hasUnusedHeld
      ? input.heldAmount! - input.amount
      : 0;

    if (user.reservedCredits >= input.amount) {
      user.consumeCredits(input.amount);

      let refundedSubscription = 0;
      let refundedOneTime = 0;
      const actualUnused = Math.min(requestedUnused, user.reservedCredits);

      if (actualUnused > 0) {
        let breakdown:
          | { subscriptionCredits?: number; oneTimeCredits?: number }
          | undefined;

        const transactions =
          await this.creditTransactionRepository.findByUserId(input.userId);
        const holdTx = transactions.find(
          (tx) => tx.type === "HOLD" && tx.description.includes(input.fileId)
        );
        if (holdTx) {
          const match = /\[sub:(\d+),ot:(\d+)\]/.exec(holdTx.description);
          if (match?.[1] !== undefined && match?.[2] !== undefined) {
            breakdown = {
              subscriptionCredits: parseInt(match[1], 10),
              oneTimeCredits: parseInt(match[2], 10),
            };
          }
        }

        const refundResult = user.refundCredits(actualUnused, breakdown);
        refundedSubscription = refundResult.refundedSubscription;
        refundedOneTime = refundResult.refundedOneTime;
      }

      const totalReservedDecrement = input.amount + actualUnused;

      await this.unitOfWork.execute(async () => {
        await this.userRepository.updateCredits(input.userId, {
          reservedCreditsDecrement: totalReservedDecrement,
          ...(actualUnused > 0 && { creditsIncrement: actualUnused }),
          ...(refundedSubscription > 0 && {
            subscriptionCreditsIncrement: refundedSubscription,
          }),
          ...(refundedOneTime > 0 && {
            oneTimeCreditsIncrement: refundedOneTime,
          }),
        });

        await this.creditTransactionRepository.create({
          userId: input.userId,
          amount: input.amount,
          type: "CONSUME",
          description: `Consumo efetivo de ${input.amount} créditos para o arquivo ${input.fileId}`,
        });
      });
    } else {
      const fromReserved = user.reservedCredits;
      const remainingAmount = input.amount - fromReserved;

      if (fromReserved > 0) {
        user.consumeCredits(fromReserved);
      }

      const { debitedSubscription, debitedOneTime } =
        user.deductCreditsPrioritized(remainingAmount);

      await this.unitOfWork.execute(async () => {
        await this.userRepository.updateCredits(input.userId, {
          ...(fromReserved > 0 && { reservedCreditsDecrement: fromReserved }),
          creditsDecrement: remainingAmount,
          subscriptionCreditsDecrement: debitedSubscription,
          oneTimeCreditsDecrement: debitedOneTime,
        });

        await this.creditTransactionRepository.create({
          userId: input.userId,
          amount: input.amount,
          type: "CONSUME",
          description: `Consumo efetivo de ${input.amount} créditos para o arquivo ${input.fileId}`,
        });
      });
    }

    return { success: true };
  }
}
