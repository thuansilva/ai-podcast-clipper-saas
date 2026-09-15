import { NotFoundError } from "~/domain/errors/not-found-error";
import { User } from "~/domain/entities/user";
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
    const userRecord = await this.userRepository.findById(input.userId);
    if (!userRecord) {
      throw new NotFoundError("Usuário", input.userId);
    }

    const transactions =
      await this.creditTransactionRepository.findByUserId(input.userId);
    const holdTx = transactions.find(
      (tx) => tx.type === "HOLD" && tx.description.includes(input.fileId)
    );

    let breakdown:
      | { subscriptionCredits?: number; oneTimeCredits?: number }
      | undefined;
    if (holdTx) {
      const match = /\[sub:(\d+),ot:(\d+)\]/.exec(holdTx.description);
      if (match?.[1] !== undefined && match?.[2] !== undefined) {
        breakdown = {
          subscriptionCredits: parseInt(match[1], 10),
          oneTimeCredits: parseInt(match[2], 10),
        };
      }
    }

    const user = User.restore(userRecord);
    const { refundedSubscription, refundedOneTime } = user.refundCredits(
      input.amount,
      breakdown
    );

    await this.unitOfWork.execute(async () => {
      await this.userRepository.updateCredits(input.userId, {
        creditsIncrement: input.amount,
        ...(refundedSubscription > 0 && {
          subscriptionCreditsIncrement: refundedSubscription,
        }),
        ...(refundedOneTime > 0 && {
          oneTimeCreditsIncrement: refundedOneTime,
        }),
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
