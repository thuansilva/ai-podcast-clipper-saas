import { DomainError } from "../errors/domain-error";

export type CreditTransactionType =
  | "PURCHASE"
  | "HOLD"
  | "CONSUME"
  | "REFUND"
  | "SUBSCRIPTION_RENEWAL";

export interface CreditTransactionEntity {
  id: string;
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  createdAt: Date;
}

export interface CreateCreditTransactionInput {
  id?: string;
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
}

/**
 * Entidade de Domínio / Registro de Auditoria: CreditTransaction
 * Representa um lançamento imutável no livro-razão (ledger) de créditos.
 * Garante as invariantes de valor estritamente positivo e descrição obrigatória.
 */
export class CreditTransaction {
  public readonly id: string;
  public readonly userId: string;
  public readonly amount: number;
  public readonly type: CreditTransactionType;
  public readonly description: string;
  public readonly createdAt: Date;

  constructor(
    id: string,
    userId: string,
    amount: number,
    type: CreditTransactionType,
    description: string,
    createdAt: Date
  ) {
    if (amount <= 0) {
      throw new DomainError("O valor da transação deve ser positivo.");
    }
    if (!description || description.trim() === "") {
      throw new DomainError("A descrição da transação não pode ser vazia.");
    }

    this.id = id;
    this.userId = userId;
    this.amount = amount;
    this.type = type;
    this.description = description.trim();
    this.createdAt = createdAt;
  }

  public static create(input: CreateCreditTransactionInput): CreditTransaction {
    return new CreditTransaction(
      input.id ?? "",
      input.userId,
      input.amount,
      input.type,
      input.description,
      new Date()
    );
  }

  public static restore(data: CreditTransactionEntity): CreditTransaction {
    return new CreditTransaction(
      data.id,
      data.userId,
      data.amount,
      data.type,
      data.description,
      data.createdAt
    );
  }

  public toJSON(): CreditTransactionEntity {
    return {
      id: this.id,
      userId: this.userId,
      amount: this.amount,
      type: this.type,
      description: this.description,
      createdAt: this.createdAt,
    };
  }
}
