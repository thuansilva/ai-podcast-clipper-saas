import { describe, it, expect } from "vitest";
import {
  CreditPricingService,
  calculateVideoCredits,
  calculateManualCutsCredits,
  type ManualCutDurationItem,
} from "~/domain/services/credit-pricing.service";

describe("CreditPricingService (Domain Service)", () => {
  describe("calculateVideoCredits (RN-01)", () => {
    it("deve retornar 1 crédito para durações de até 60 segundos", () => {
      expect(calculateVideoCredits(1)).toBe(1);
      expect(calculateVideoCredits(30)).toBe(1);
      expect(calculateVideoCredits(60)).toBe(1);
      expect(CreditPricingService.calculateVideoCredits(60)).toBe(1);
    });

    it("deve arredondar para cima minutos fracionados (ceil)", () => {
      expect(calculateVideoCredits(61)).toBe(2);
      expect(calculateVideoCredits(119)).toBe(2);
      expect(calculateVideoCredits(120)).toBe(2);
      expect(calculateVideoCredits(121)).toBe(3);
      expect(CreditPricingService.calculateVideoCredits(3600)).toBe(60);
    });

    it("deve retornar 1 crédito como piso mínimo para durações <= 0 ou inválidas", () => {
      expect(calculateVideoCredits(0)).toBe(1);
      expect(calculateVideoCredits(-10)).toBe(1);
      expect(calculateVideoCredits(NaN)).toBe(1);
      expect(CreditPricingService.calculateVideoCredits(Infinity)).toBe(1);
    });
  });

  describe("calculateManualCutsCredits", () => {
    it("deve retornar 0 para lista de cortes vazia, nula ou indefinida", () => {
      expect(calculateManualCutsCredits([])).toBe(0);
      expect(calculateManualCutsCredits(null as unknown as ManualCutDurationItem[])).toBe(0);
      expect(calculateManualCutsCredits(undefined as unknown as ManualCutDurationItem[])).toBe(0);
    });

    it("deve retornar 0 para cortes com duração zero ou invertida", () => {
      expect(calculateManualCutsCredits([{ startTime: 10, endTime: 10 }])).toBe(0);
      expect(calculateManualCutsCredits([{ startTime: 30, endTime: 10 }])).toBe(0);
    });

    it("deve cobrar 1 crédito para corte único com duração de até 60 segundos", () => {
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 1 }])).toBe(1);
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 30 }])).toBe(1);
      expect(calculateManualCutsCredits([{ startTime: 10, endTime: 70 }])).toBe(1);
    });

    it("deve arredondar para cima minutos fracionados em cortes individuais (ceil)", () => {
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 61 }])).toBe(2);
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 120 }])).toBe(2);
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 121 }])).toBe(3);
    });

    it("deve somar corretamente os créditos de múltiplos cortes independentes", () => {
      const cuts: ManualCutDurationItem[] = [
        { startTime: 0, endTime: 30 },    // 30s -> 1 crédito
        { startTime: 100, endTime: 170 }, // 70s -> 2 créditos
        { startTime: 200, endTime: 200 }, // 0s -> 0 créditos
        { startTime: 300, endTime: 425 }, // 125s -> 3 créditos
      ];

      expect(calculateManualCutsCredits(cuts)).toBe(6);
      expect(CreditPricingService.calculateManualCutsCredits(cuts)).toBe(6);
    });

    it("deve lidar com cortes com durações fracionárias / decimais", () => {
      expect(calculateManualCutsCredits([{ startTime: 0, endTime: 60.2 }])).toBe(2);
      expect(calculateManualCutsCredits([{ startTime: 10.5, endTime: 70.5 }])).toBe(1);
    });
  });
});
