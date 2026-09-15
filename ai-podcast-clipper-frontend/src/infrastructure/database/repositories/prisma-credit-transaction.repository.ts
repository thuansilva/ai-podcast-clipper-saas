import { db } from "~/server/db";
import {
  CreditTransaction,
  type CreditTransactionEntity,
  type CreditTransactionType,
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
    // Validação de invariantes via Entidade de Domínio
    const domainTx = CreditTransaction.create(input);

    const tx = await db.creditTransaction.create({
      data: {
        userId: domainTx.userId,
        amount: domainTx.amount,
        type: domainTx.type,
        description: domainTx.description,
      },
    });

    return CreditTransaction.restore({
      id: tx.id,
      userId: tx.userId,
      amount: tx.amount,
      type: tx.type as CreditTransactionType,
      description: tx.description,
      createdAt: tx.createdAt,
    }).toJSON();
  }

  async findByUserId(userId: string): Promise<CreditTransactionEntity[]> {
    const txs = await db.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return txs.map((tx) =>
      CreditTransaction.restore({
        id: tx.id,
        userId: tx.userId,
        amount: tx.amount,
        type: tx.type as CreditTransactionType,
        description: tx.description,
        createdAt: tx.createdAt,
      }).toJSON()
    );
  }
}
