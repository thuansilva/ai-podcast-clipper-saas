import { describe, it, expect } from "vitest";
import { User } from "~/domain/entities/user";
import { InsufficientCreditsError } from "~/domain/errors/insufficient-credits-error";
import { DomainError } from "~/domain/errors/domain-error";

describe("User Rich Domain Entity", () => {
  it("deve instanciar um novo usuário com valores padrão via User.create", () => {
    const user = User.create({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
    });

    expect(user.id).toBe("user-1");
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.credits).toBe(10);
    expect(user.reservedCredits).toBe(0);
    expect(user.plan).toBe("STARTER");
    expect(user.maxVideoDurationAllowed()).toBe(7200); // 2h
  });

  it("deve reconstituir um usuário existente do banco via User.restore", () => {
    const user = User.restore({
      id: "user-2",
      email: "studio@example.com",
      credits: 100,
      reservedCredits: 20,
      plan: "STUDIO",
      name: "Studio User",
      image: "https://avatar.com/u2.png",
      stripeCustomerId: "cus_123",
    });

    expect(user.id).toBe("user-2");
    expect(user.email).toBe("studio@example.com");
    expect(user.plan).toBe("STUDIO");
    expect(user.credits).toBe(100);
    expect(user.reservedCredits).toBe(20);
    expect(user.image).toBe("https://avatar.com/u2.png");
    expect(user.stripeCustomerId).toBe("cus_123");
    expect(user.maxVideoDurationAllowed()).toBe(10800); // 3h
  });

  it("deve lançar DomainError se restaurar com créditos negativos", () => {
    expect(() =>
      User.restore({
        id: "u1",
        email: "u1@test.com",
        credits: -5,
        reservedCredits: 0,
      })
    ).toThrow(DomainError);

    expect(() =>
      User.restore({
        id: "u1",
        email: "u1@test.com",
        credits: 10,
        reservedCredits: -2,
      })
    ).toThrow(DomainError);
  });

  describe("Regras de Créditos", () => {
    it("deve reter créditos com sucesso quando o saldo for suficiente", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 50,
        reservedCredits: 0,
      });
      user.holdCredits(20);

      expect(user.credits).toBe(30);
      expect(user.reservedCredits).toBe(20);
    });

    it("deve lançar InsufficientCreditsError ao tentar reter mais créditos do que possui", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 15,
        reservedCredits: 0,
      });

      expect(() => user.holdCredits(20)).toThrow(InsufficientCreditsError);
      expect(user.credits).toBe(15);
      expect(user.reservedCredits).toBe(0);
    });

    it("deve lançar erro se o valor a reter for menor ou igual a zero", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 50,
        reservedCredits: 0,
      });

      expect(() => user.holdCredits(0)).toThrow(DomainError);
      expect(() => user.holdCredits(-5)).toThrow(DomainError);
    });

    it("deve consumir créditos retidos com sucesso", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 30,
        reservedCredits: 20,
      });
      user.consumeCredits(15);

      expect(user.reservedCredits).toBe(5);
      expect(user.credits).toBe(30);
    });

    it("deve lançar erro ao tentar consumir mais do que os créditos retidos", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 30,
        reservedCredits: 10,
      });

      expect(() => user.consumeCredits(15)).toThrow(DomainError);
    });

    it("deve estornar créditos retidos de volta ao saldo disponível", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 30,
        reservedCredits: 20,
      });
      user.refundCredits(15);

      expect(user.credits).toBe(45);
      expect(user.reservedCredits).toBe(5);
    });

    it("deve adicionar novos créditos comprados", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        credits: 10,
        reservedCredits: 0,
      });
      user.addCredits(50);

      expect(user.credits).toBe(60);
    });
  });

  describe("Regras de Plano e Duração", () => {
    it("deve calcular o teto de duração de acordo com o plano", () => {
      const starter = User.restore({
        id: "u1",
        email: "u1@test.com",
        credits: 10,
        reservedCredits: 0,
        plan: "STARTER",
      });
      expect(starter.maxVideoDurationAllowed()).toBe(7200);
      expect(starter.canProcessDuration(7200)).toBe(true);
      expect(starter.canProcessDuration(7201)).toBe(false);

      const studio = User.restore({
        id: "u2",
        email: "u2@test.com",
        credits: 10,
        reservedCredits: 0,
        plan: "STUDIO",
      });
      expect(studio.maxVideoDurationAllowed()).toBe(10800);
      expect(studio.canProcessDuration(10800)).toBe(true);
      expect(studio.canProcessDuration(10801)).toBe(false);
    });

    it("deve atualizar o plano através de upgradePlan", () => {
      const user = User.create({
        id: "u1",
        email: "u1@test.com",
      });
      expect(user.plan).toBe("STARTER");

      user.upgradePlan("STUDIO");
      expect(user.plan).toBe("STUDIO");
      expect(user.maxVideoDurationAllowed()).toBe(10800);
    });
  });

  describe("Serialização toJSON", () => {
    it("deve serializar corretamente para objeto puro", () => {
      const user = User.restore({
        id: "user-1",
        email: "test@test.com",
        credits: 40,
        reservedCredits: 10,
        plan: "STUDIO",
        name: "Nome",
        image: "img.png",
        stripeCustomerId: "cus_1",
      });
      const json = user.toJSON();

      expect(json).toEqual({
        id: "user-1",
        email: "test@test.com",
        credits: 40,
        reservedCredits: 10,
        plan: "STUDIO",
        name: "Nome",
        image: "img.png",
        stripeCustomerId: "cus_1",
      });
    });
  });
});
