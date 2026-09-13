import { describe, it, expect } from "vitest";
import { CreditTransaction } from "~/domain/entities/credit-transaction";
import { DomainError } from "~/domain/errors/domain-error";

describe("CreditTransaction Domain Entity", () => {
  const baseTxData = {
    id: "tx-123",
    userId: "user-456",
    amount: 15,
    type: "HOLD" as const,
    description: "Hold de 15 créditos para processamento",
    createdAt: new Date("2026-09-01T12:00:00Z"),
  };

  it("deve reconstituir uma transação existente via CreditTransaction.restore", () => {
    const tx = CreditTransaction.restore(baseTxData);

    expect(tx.id).toBe("tx-123");
    expect(tx.userId).toBe("user-456");
    expect(tx.amount).toBe(15);
    expect(tx.type).toBe("HOLD");
    expect(tx.description).toBe("Hold de 15 créditos para processamento");
    expect(tx.createdAt).toEqual(new Date("2026-09-01T12:00:00Z"));
  });

  it("deve criar uma nova transação via CreditTransaction.create", () => {
    const tx = CreditTransaction.create({
      userId: "user-456",
      amount: 50,
      type: "PURCHASE",
      description: "Compra de pacote 50 créditos",
    });

    expect(tx.id).toBe("");
    expect(tx.amount).toBe(50);
    expect(tx.type).toBe("PURCHASE");
    expect(tx.createdAt).toBeInstanceOf(Date);
  });

  it("deve lançar DomainError se amount for menor ou igual a zero", () => {
    expect(() => {
      CreditTransaction.create({
        userId: "user-1",
        amount: 0,
        type: "HOLD",
        description: "Hold inválido",
      });
    }).toThrow(DomainError);

    expect(() => {
      CreditTransaction.create({
        userId: "user-1",
        amount: -10,
        type: "HOLD",
        description: "Hold negativo",
      });
    }).toThrow(DomainError);
  });

  it("deve lançar DomainError se a descrição for vazia", () => {
    expect(() => {
      CreditTransaction.create({
        userId: "user-1",
        amount: 10,
        type: "CONSUME",
        description: "   ",
      });
    }).toThrow(DomainError);
  });

  it("deve identificar corretamente os tipos de transação", () => {
    const hold = CreditTransaction.create({
      userId: "u1",
      amount: 10,
      type: "HOLD",
      description: "hold",
    });
    expect(hold.isHold()).toBe(true);
    expect(hold.isConsume()).toBe(false);

    const consume = CreditTransaction.create({
      userId: "u1",
      amount: 10,
      type: "CONSUME",
      description: "consume",
    });
    expect(consume.isConsume()).toBe(true);

    const refund = CreditTransaction.create({
      userId: "u1",
      amount: 10,
      type: "REFUND",
      description: "refund",
    });
    expect(refund.isRefund()).toBe(true);

    const purchase = CreditTransaction.create({
      userId: "u1",
      amount: 10,
      type: "PURCHASE",
      description: "purchase",
    });
    expect(purchase.isPurchase()).toBe(true);
  });

  it("deve serializar corretamente via toJSON()", () => {
    const tx = CreditTransaction.restore(baseTxData);
    const json = tx.toJSON();

    expect(json).toEqual({
      id: "tx-123",
      userId: "user-456",
      amount: 15,
      type: "HOLD",
      description: "Hold de 15 créditos para processamento",
      createdAt: baseTxData.createdAt,
    });
  });
});
