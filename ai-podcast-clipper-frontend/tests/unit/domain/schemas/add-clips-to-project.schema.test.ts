import { describe, it, expect } from "vitest";
import { addClipsToProjectSchema } from "~/domain/schemas/add-clips-to-project.schema";
import {
  MAX_MANUAL_CUTS,
  MAX_MANUAL_CUT_DURATION_SECONDS,
} from "~/domain/schemas/manual-cut.schema";

describe("addClipsToProjectSchema", () => {
  it("aceita modo manual com cortes válidos", () => {
    const result = addClipsToProjectSchema.safeParse({
      mode: "manual",
      manualCuts: [{ startTime: 10, endTime: 20 }],
    });
    expect(result.success).toBe(true);
  });

  it("aceita modo auto com slice válido", () => {
    const result = addClipsToProjectSchema.safeParse({
      mode: "auto",
      aiSlice: { startTime: 0, endTime: 600 },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita modo manual sem cortes", () => {
    expect(
      addClipsToProjectSchema.safeParse({ mode: "manual", manualCuts: [] })
        .success
    ).toBe(false);
  });

  it("rejeita modo auto sem slice", () => {
    expect(addClipsToProjectSchema.safeParse({ mode: "auto" }).success).toBe(
      false
    );
  });

  it(`rejeita mais de ${MAX_MANUAL_CUTS} cortes manuais (mesmo limite da importação)`, () => {
    const manualCuts = Array.from({ length: MAX_MANUAL_CUTS + 1 }, (_, i) => ({
      startTime: i * 100,
      endTime: i * 100 + 10,
    }));
    expect(
      addClipsToProjectSchema.safeParse({ mode: "manual", manualCuts }).success
    ).toBe(false);
  });

  it(`rejeita corte manual com mais de ${MAX_MANUAL_CUT_DURATION_SECONDS}s`, () => {
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "manual",
        manualCuts: [{ startTime: 0, endTime: MAX_MANUAL_CUT_DURATION_SECONDS + 1 }],
      }).success
    ).toBe(false);
  });

  it("rejeita startTime negativo (manual e slice)", () => {
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "manual",
        manualCuts: [{ startTime: -5, endTime: 10 }],
      }).success
    ).toBe(false);
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "auto",
        aiSlice: { startTime: -5, endTime: 10 },
      }).success
    ).toBe(false);
  });

  it("rejeita slice com endTime <= startTime", () => {
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "auto",
        aiSlice: { startTime: 100, endTime: 100 },
      }).success
    ).toBe(false);
  });

  // Bug de segurança encontrado na auditoria: Zod 3 aceita `Infinity` em
  // `z.number()` (só `NaN` é rejeitado), e o protocolo de Server Actions do
  // React serializa `Infinity` nos argumentos — um payload forjado chegava ao
  // use case/banco/evento Inngest com `endTime: Infinity` (que vira `null` no
  // JSON). `aiSlice` era o único campo numérico novo sem teto: os cortes
  // manuais já são limitados indiretamente pelo refine de 60s.
  it("rejeita aiSlice com endTime/startTime não finitos (Infinity)", () => {
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "auto",
        aiSlice: { startTime: 0, endTime: Infinity },
      }).success
    ).toBe(false);
    expect(
      addClipsToProjectSchema.safeParse({
        mode: "auto",
        aiSlice: { startTime: Infinity, endTime: Infinity },
      }).success
    ).toBe(false);
  });

  it("nunca aceita userId/projectId vindos do cliente (campos extras são descartados)", () => {
    const result = addClipsToProjectSchema.safeParse({
      mode: "manual",
      manualCuts: [{ startTime: 10, endTime: 20 }],
      userId: "attacker",
      projectId: "someone-else",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("userId");
    expect(result.data).not.toHaveProperty("projectId");
  });
});
