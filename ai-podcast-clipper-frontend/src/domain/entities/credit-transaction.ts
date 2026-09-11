export type CreditTransactionType = "PURCHASE" | "HOLD" | "CONSUME" | "REFUND";

export interface CreditTransactionEntity {
  id: string;
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  createdAt: Date;
}
