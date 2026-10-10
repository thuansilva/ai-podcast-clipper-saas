import { describe, it, expect } from "vitest";
import {
  manualCutSchema,
  manualCutsArraySchema,
  MAX_MANUAL_CUTS,
} from "~/domain/schemas/manual-cut.schema";

describe("manualCutSchema", () => {
  it("aceita um corte válido com startTime < endTime", () => {
    const result = manualCutSchema.safeParse({
      id: "cut-1",
      title: "Corte 1",
      startTime: 10,
      endTime: 20,
    });

    expect(result.success).toBe(true);
  });

  it("aceita um corte válido sem id/title (opcionais)", () => {
    const result = manualCutSchema.safeParse({
      startTime: 0,
      endTime: 5,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita quando endTime é igual a startTime", () => {
    const result = manualCutSchema.safeParse({
      startTime: 10,
      endTime: 10,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita quando endTime é menor que startTime", () => {
    const result = manualCutSchema.safeParse({
      startTime: 30,
      endTime: 15,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita startTime negativo", () => {
    const result = manualCutSchema.safeParse({
      startTime: -1,
      endTime: 10,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita endTime negativo", () => {
    const result = manualCutSchema.safeParse({
      startTime: 0,
      endTime: -5,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita startTime/endTime não numéricos", () => {
    const result = manualCutSchema.safeParse({
      startTime: "10" as unknown,
      endTime: 20,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita title acima do tamanho máximo", () => {
    const result = manualCutSchema.safeParse({
      startTime: 0,
      endTime: 10,
      title: "a".repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it("rejeita corte com duração acima de 60s (RN-PIPE-MANUAL-04, mesmo limite do backend)", () => {
    const result = manualCutSchema.safeParse({
      startTime: 0,
      endTime: 70, // 70s > 60s
    });

    expect(result.success).toBe(false);
  });

  it("aceita corte com duração igual a 60s (limite inclusive)", () => {
    const result = manualCutSchema.safeParse({
      startTime: 0,
      endTime: 60,
    });

    expect(result.success).toBe(true);
  });
});

describe("manualCutsArraySchema", () => {
  it("aceita um array vazio", () => {
    const result = manualCutsArraySchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it(`aceita até ${MAX_MANUAL_CUTS} cortes`, () => {
    const cuts = Array.from({ length: MAX_MANUAL_CUTS }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const result = manualCutsArraySchema.safeParse(cuts);
    expect(result.success).toBe(true);
  });

  it(`rejeita mais de ${MAX_MANUAL_CUTS} cortes (payload malicioso)`, () => {
    const cuts = Array.from({ length: MAX_MANUAL_CUTS + 1 }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const result = manualCutsArraySchema.safeParse(cuts);
    expect(result.success).toBe(false);
  });

  it("rejeita o array se qualquer corte individual for inválido", () => {
    const result = manualCutsArraySchema.safeParse([
      { startTime: 0, endTime: 10 },
      { startTime: 50, endTime: 10 },
    ]);

    expect(result.success).toBe(false);
  });
});
