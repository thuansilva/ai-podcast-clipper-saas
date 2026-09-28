import { describe, it, expect } from "vitest";
import { updateClipSchema } from "~/domain/schemas/update-clip.schema";

describe("updateClipSchema", () => {
  it("aceita um payload vazio (todos os campos são opcionais)", () => {
    const result = updateClipSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita title, subtitlePreset e transcriptWords válidos", () => {
    const result = updateClipSchema.safeParse({
      title: "Meu clipe",
      subtitlePreset: "NEON",
      transcriptWords: [{ word: "Olá", start: 0, end: 0.5 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita title vazio", () => {
    const result = updateClipSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita subtitlePreset fora do enum conhecido", () => {
    const result = updateClipSchema.safeParse({ subtitlePreset: "INEXISTENTE" });
    expect(result.success).toBe(false);
  });

  it("rejeita transcriptWords com item malformado (sem start/end numéricos)", () => {
    const result = updateClipSchema.safeParse({
      transcriptWords: [{ word: "Olá", start: "zero", end: 0.5 }],
    });
    expect(result.success).toBe(false);
  });
});
