import { DomainError } from "../errors/domain-error";

export type CreditTransactionType = "PURCHASE" | "HOLD" | "CONSUME" | "REFUND";

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

export class CreditTransaction {
  public readonly id: string;
  public readonly userId: string;
  public readonly amount: number;
  public readonly type: CreditTransactionType;
  public readonly description: string;
  public readonly createdAt: Date;

  /**
   * Construtor privado: instanciação permitida apenas via factory methods
   */
  private constructor(
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

  /**
   * Factory para criar uma nova transação no domínio
   */
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

  /**
   * Factory para reconstituir uma transação persistida do banco de dados
   */
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

  public isHold(): boolean {
    return this.type === "HOLD";
  }

  public isConsume(): boolean {
    return this.type === "CONSUME";
  }

  public isRefund(): boolean {
    return this.type === "REFUND";
  }

  public isPurchase(): boolean {
    return this.type === "PURCHASE";
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
