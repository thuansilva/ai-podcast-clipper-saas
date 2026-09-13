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
    user.consumeCredits(input.amount);

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(input.userId, {
        reservedCreditsDecrement: input.amount,
      });

      await this.creditTransactionRepository.create({
        userId: input.userId,
        amount: input.amount,
        type: "CONSUME",
        description: `Consumo efetivo de ${input.amount} créditos para o arquivo ${input.fileId}`,
      });
    });

    return { success: true };
  }
}
