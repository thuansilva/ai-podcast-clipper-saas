import type {
  CreditTransactionEntity,
  CreditTransactionType,
} from "../entities/credit-transaction";

export interface CreateCreditTransactionInput {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
}

export interface ICreditTransactionRepository {
  create(input: CreateCreditTransactionInput): Promise<CreditTransactionEntity>;
  findByUserId(userId: string): Promise<CreditTransactionEntity[]>;
}
