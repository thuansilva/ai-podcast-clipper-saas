import { describe, it, expect } from "vitest";
import { calculateVideoCredits } from "~/domain/rules/calculate-credits";

describe("RN-01: calculateVideoCredits", () => {
  it("deve retornar 1 crédito para durações de até 60 segundos", () => {
    expect(calculateVideoCredits(1)).toBe(1);
    expect(calculateVideoCredits(30)).toBe(1);
    expect(calculateVideoCredits(60)).toBe(1);
  });

  it("deve arredondar para cima minutos fracionados (ceil)", () => {
    expect(calculateVideoCredits(61)).toBe(2);
    expect(calculateVideoCredits(119)).toBe(2);
    expect(calculateVideoCredits(120)).toBe(2);
    expect(calculateVideoCredits(121)).toBe(3);
  });

  it("deve retornar 1 crédito como piso mínimo para durações <= 0 ou inválidas", () => {
    expect(calculateVideoCredits(0)).toBe(1);
    expect(calculateVideoCredits(-10)).toBe(1);
    expect(calculateVideoCredits(NaN)).toBe(1);
  });
});
