import { calculateVideoCredits } from "~/domain/rules/calculate-credits";
import { User } from "~/domain/entities/user";
import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type {
  HoldCreditsInput,
  HoldCreditsOutput,
} from "~/application/dtos/credits-dtos";

export class HoldCreditsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(input: HoldCreditsInput): Promise<HoldCreditsOutput> {
    const requiredCredits =
      input.amount ?? calculateVideoCredits(input.durationSeconds);

    const userRecord = await this.userRepository.findById(input.userId);
    if (!userRecord) {
      throw new NotFoundError("Usuário", input.userId);
    }

    const user = User.restore(userRecord);
    user.holdCredits(requiredCredits);

    return await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(input.userId, {
        creditsDecrement: requiredCredits,
        reservedCreditsIncrement: requiredCredits,
      });

      await this.creditTransactionRepository.create({
        userId: input.userId,
        amount: requiredCredits,
        type: "HOLD",
        description: `Hold de ${requiredCredits} créditos para processamento do arquivo ${input.fileId}`,
      });

      await this.uploadedFileRepository.update(input.fileId, {
        creditsCost: requiredCredits,
      });

      return {
        success: true,
        heldCredits: requiredCredits,
      };
    });
  }
}
