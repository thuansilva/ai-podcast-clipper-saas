import { describe, it, expect } from "vitest";
import { isManualCut } from "~/domain/services/clip-origin.service";

const autoClip = { viralityScore: 8.5, hook: "gancho", reason: "motivo" };
const noAiClip = { viralityScore: null, hook: null, reason: null };

describe("isManualCut", () => {
  it("é manual quando o projeto tem manualCutsJson preenchido", () => {
    expect(
      isManualCut(autoClip, { manualCutsJson: [{ title: "a", start: 0, end: 5 }] }),
    ).toBe(true);
  });

  it("não é manual quando o projeto não tem cortes e o clipe tem nota do Gemini", () => {
    expect(isManualCut(autoClip, { manualCutsJson: null })).toBe(false);
    expect(isManualCut(autoClip, null)).toBe(false);
    expect(isManualCut(autoClip)).toBe(false);
  });

  it("fallback legado: projeto sem manualCutsJson e clipe sem nota, gancho e motivo é manual", () => {
    expect(isManualCut(noAiClip, { manualCutsJson: null })).toBe(true);
    expect(isManualCut(noAiClip)).toBe(true);
  });

  it("fallback não dispara se houver qualquer sinal do Gemini (nota 0 conta como nota)", () => {
    expect(isManualCut({ viralityScore: 0, hook: null, reason: null })).toBe(false);
    expect(isManualCut({ viralityScore: null, hook: "x", reason: null })).toBe(false);
    expect(isManualCut({ viralityScore: null, hook: null, reason: "y" })).toBe(false);
  });
});
