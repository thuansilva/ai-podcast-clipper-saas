import type { CreditTransactionEntity } from "~/domain/entities/credit-transaction";
import type {
  CreateCreditTransactionInput,
  ICreditTransactionRepository,
} from "~/domain/ports/credit-transaction-repository";

export class InMemoryCreditTransactionRepository
  implements ICreditTransactionRepository
{
  public transactions: CreditTransactionEntity[] = [];

  async create(
    input: CreateCreditTransactionInput
  ): Promise<CreditTransactionEntity> {
    const tx: CreditTransactionEntity = {
      id: `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: input.userId,
      amount: input.amount,
      type: input.type,
      description: input.description,
      createdAt: new Date(),
    };
    this.transactions.push(tx);
    return tx;
  }

  async findByUserId(userId: string): Promise<CreditTransactionEntity[]> {
    return this.transactions.filter((tx) => tx.userId === userId);
  }
}
