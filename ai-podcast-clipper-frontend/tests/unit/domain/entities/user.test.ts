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

    expect(() =>
      User.restore({
        id: "u1",
        email: "u1@test.com",
        credits: 10,
        subscriptionCredits: -5,
        oneTimeCredits: 15,
        reservedCredits: 0,
      })
    ).toThrow(DomainError);

    expect(() =>
      User.restore({
        id: "u1",
        email: "u1@test.com",
        credits: 10,
        subscriptionCredits: 5,
        oneTimeCredits: -5,
        reservedCredits: 0,
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
      const result = user.refundCredits(15);

      expect(result).toEqual({ refundedSubscription: 0, refundedOneTime: 15 });
      expect(user.credits).toBe(45);
      expect(user.reservedCredits).toBe(5);
    });

    it("deve estornar créditos respeitando o breakdown informado (evitando lavagem de créditos)", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        subscriptionCredits: 50,
        oneTimeCredits: 20,
        credits: 70,
        reservedCredits: 30,
        plan: "CREATOR",
      });

      // Estorna 25 créditos com breakdown: 20 da assinatura e 5 avulsos
      const result = user.refundCredits(25, {
        subscriptionCredits: 20,
        oneTimeCredits: 5,
      });

      expect(result).toEqual({ refundedSubscription: 20, refundedOneTime: 5 });
      expect(user.subscriptionCredits).toBe(70);
      expect(user.oneTimeCredits).toBe(25);
      expect(user.credits).toBe(95);
      expect(user.reservedCredits).toBe(5);
    });

    it("deve estornar créditos calculando headroom da cota quando breakdown não for fornecido", () => {
      const user = User.restore({
        id: "user-1",
        email: "user@test.com",
        subscriptionCredits: 140, // cota CREATOR é 150, então headroom = 10
        oneTimeCredits: 20,
        credits: 160,
        reservedCredits: 25,
        plan: "CREATOR",
      });

      // Estorna 20 créditos sem breakdown: 10 vão para subscription (headroom) e 10 para oneTime
      const result = user.refundCredits(20);

      expect(result).toEqual({ refundedSubscription: 10, refundedOneTime: 10 });
      expect(user.subscriptionCredits).toBe(150);
      expect(user.oneTimeCredits).toBe(30);
      expect(user.credits).toBe(180);
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

    it("deve inicializar com créditos segregados corretamente", () => {
      const user = User.create({
        id: "user_1",
        email: "user@test.com",
        name: "User Test",
        subscriptionCredits: 150,
        oneTimeCredits: 50,
      });

      expect(user.subscriptionCredits).toBe(150);
      expect(user.oneTimeCredits).toBe(50);
      expect(user.credits).toBe(200); // Saldo total derivado
    });

    it("deve consumir primeiro da assinatura e depois de avulsos", () => {
      const user = User.restore({
        id: "user_1",
        email: "user@test.com",
        name: "User Test",
        credits: 170,
        subscriptionCredits: 150,
        oneTimeCredits: 20,
        reservedCredits: 0,
        plan: "CREATOR",
      });

      // Consome 160 créditos (deve tirar 150 da assinatura e 10 do avulso)
      const { debitedSubscription, debitedOneTime } = user.deductCreditsPrioritized(160);

      expect(debitedSubscription).toBe(150);
      expect(debitedOneTime).toBe(10);
      expect(user.subscriptionCredits).toBe(0);
      expect(user.oneTimeCredits).toBe(10);
      expect(user.credits).toBe(10);
    });

    it("deve consumir apenas da assinatura quando o saldo for suficiente", () => {
      const user = User.restore({
        id: "user_1",
        email: "user@test.com",
        name: "User Test",
        credits: 170,
        subscriptionCredits: 150,
        oneTimeCredits: 20,
        reservedCredits: 0,
        plan: "CREATOR",
      });

      const { debitedSubscription, debitedOneTime } = user.deductCreditsPrioritized(50);

      expect(debitedSubscription).toBe(50);
      expect(debitedOneTime).toBe(0);
      expect(user.subscriptionCredits).toBe(100);
      expect(user.oneTimeCredits).toBe(20);
      expect(user.credits).toBe(120);
    });

    it("deve lançar InsufficientCreditsError ao tentar deduzir mais créditos que o total disponível", () => {
      const user = User.restore({
        id: "user_1",
        email: "user@test.com",
        name: "User Test",
        credits: 170,
        subscriptionCredits: 150,
        oneTimeCredits: 20,
        reservedCredits: 0,
        plan: "CREATOR",
      });

      expect(() => user.deductCreditsPrioritized(200)).toThrow(InsufficientCreditsError);
    });

    it("deve lançar DomainError ao tentar deduzir valor menor ou igual a zero", () => {
      const user = User.restore({
        id: "user_1",
        email: "user@test.com",
        name: "User Test",
        credits: 170,
        subscriptionCredits: 150,
        oneTimeCredits: 20,
        reservedCredits: 0,
        plan: "CREATOR",
      });

      expect(() => user.deductCreditsPrioritized(0)).toThrow(DomainError);
      expect(() => user.deductCreditsPrioritized(-10)).toThrow(DomainError);
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
        subscriptionCredits: 0,
        oneTimeCredits: 40,
        reservedCredits: 10,
        plan: "STUDIO",
        name: "Nome",
        image: "img.png",
        stripeCustomerId: "cus_1",
      });
    });
  });

  describe("Cálculos de Duração e Orçamento no Domínio", () => {
    it("User.createTransient deve criar entidade transiente para uso no frontend", () => {
      const transient = User.createTransient({ credits: 25, plan: "PRO_STUDIO" });
      expect(transient.credits).toBe(25);
      expect(transient.plan).toBe("PRO_STUDIO");
      expect(transient.maxVideoDurationAllowed()).toBe(10800);
      expect(transient.hasSufficientCredits(20)).toBe(true);
      expect(transient.hasSufficientCredits(30)).toBe(false);
    });

    it("calculateCostForDuration deve calcular créditos baseado na duração do vídeo", () => {
      const user = User.createTransient({ credits: 10, plan: "STARTER" });
      expect(user.calculateCostForDuration(30)).toBe(1);
      expect(user.calculateCostForDuration(60)).toBe(1);
      expect(user.calculateCostForDuration(61)).toBe(2);
      expect(user.calculateCostForDuration(3600)).toBe(60);
      expect(user.calculateCostForDuration(0)).toBe(1);
    });

    it("validateVideoDuration e canProcessDuration devem validar limites de plano", () => {
      const starterUser = User.createTransient({ credits: 10, plan: "STARTER" });
      expect(starterUser.canProcessDuration(7200)).toBe(true);
      expect(starterUser.canProcessDuration(7201)).toBe(false);

      const starterValid = starterUser.validateVideoDuration(7200);
      expect(starterValid.valid).toBe(true);

      const starterInvalid = starterUser.validateVideoDuration(7201);
      expect(starterInvalid.valid).toBe(false);
      expect(starterInvalid.error).toContain("excede o limite de 2h");

      const studioUser = User.createTransient({ credits: 10, plan: "STUDIO" });
      expect(studioUser.canProcessDuration(10800)).toBe(true);
      expect(studioUser.canProcessDuration(10801)).toBe(false);

      const studioInvalid = studioUser.validateVideoDuration(10801);
      expect(studioInvalid.valid).toBe(false);
      expect(studioInvalid.error).toContain("excede o limite máximo permitido de 3h");
    });
  });
});
