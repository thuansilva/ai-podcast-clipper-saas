import { db } from "~/server/db";
import type {
  CreditTransactionEntity,
  CreditTransactionType,
} from "~/domain/entities/credit-transaction";
import type {
  CreateCreditTransactionInput,
  ICreditTransactionRepository,
} from "~/domain/ports/credit-transaction-repository";

export class PrismaCreditTransactionRepository
  implements ICreditTransactionRepository
{
  async create(
    input: CreateCreditTransactionInput
  ): Promise<CreditTransactionEntity> {
    const tx = await db.creditTransaction.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        type: input.type,
        description: input.description,
      },
    });

    return {
      id: tx.id,
      userId: tx.userId,
      amount: tx.amount,
      type: tx.type as CreditTransactionType,
      description: tx.description,
      createdAt: tx.createdAt,
    };
  }

  async findByUserId(userId: string): Promise<CreditTransactionEntity[]> {
    const txs = await db.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return txs.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      amount: tx.amount,
      type: tx.type as CreditTransactionType,
      description: tx.description,
      createdAt: tx.createdAt,
    }));
  }
}
