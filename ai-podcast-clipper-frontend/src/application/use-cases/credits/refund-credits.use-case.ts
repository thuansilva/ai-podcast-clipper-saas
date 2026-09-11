import { NotFoundError } from "~/domain/errors/not-found-error";
import type { IUserRepository } from "~/domain/ports/user-repository";
import type { IUploadedFileRepository } from "~/domain/ports/uploaded-file-repository";
import type { ICreditTransactionRepository } from "~/domain/ports/credit-transaction-repository";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";
import type { RefundCreditsInput } from "~/application/dtos/credits-dtos";

export class RefundCreditsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly uploadedFileRepository: IUploadedFileRepository,
    private readonly creditTransactionRepository: ICreditTransactionRepository,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async execute(input: RefundCreditsInput): Promise<{ success: boolean }> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new NotFoundError("Usuário", input.userId);
    }

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(input.userId, {
        creditsIncrement: input.amount,
        reservedCreditsDecrement: input.amount,
      });

      await this.creditTransactionRepository.create({
        userId: input.userId,
        amount: input.amount,
        type: "REFUND",
        description: `Estorno de ${input.amount} créditos para o arquivo ${input.fileId}: ${input.reason}`,
      });

      await this.uploadedFileRepository.update(input.fileId, {
        status: "failed",
        errorMessage: input.reason,
      });
    });

    return { success: true };
  }
}
