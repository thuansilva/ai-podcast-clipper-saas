import { describe, expect, it } from "vitest";
import { resolveClipSourceRange } from "~/domain/services/clip-source-range.service";

describe("resolveClipSourceRange — tempo do clipe no vídeo ORIGINAL", () => {
  it("identity: o arquivo processado é o vídeo original inteiro (upload direto / YouTube completo)", () => {
    expect(resolveClipSourceRange({ start: 161, end: 221 }, { kind: "identity" })).toEqual({
      sourceStartTime: 161,
      sourceEndTime: 221,
    });
  });

  it("merged-range: converte do arquivo de saída para o original via offset", () => {
    expect(
      resolveClipSourceRange(
        { start: 12, end: 42 },
        {
          kind: "merged-range",
          mergedRange: { original_start: 598, original_end: 902, offset_in_output: 0 },
        },
      ),
    ).toEqual({ sourceStartTime: 610, sourceEndTime: 640 });
  });

  it("merged-range sem range devolvido: null (nunca inventa)", () => {
    expect(
      resolveClipSourceRange({ start: 12, end: 42 }, { kind: "merged-range", mergedRange: undefined }),
    ).toEqual({ sourceStartTime: null, sourceEndTime: null });
  });

  it("remapped-cuts: casa pelo par new_start/new_end (tolerância < 0.5s) e devolve o original", () => {
    const cuts = [
      { original_start: 100, original_end: 130, new_start: 2, new_end: 32 },
      { original_start: 500, original_end: 570, new_start: 36, new_end: 106 },
    ];
    expect(resolveClipSourceRange({ start: 36.2, end: 105.9 }, { kind: "remapped-cuts", cuts })).toEqual({
      sourceStartTime: 500,
      sourceEndTime: 570,
    });
  });

  it("remapped-cuts sem correspondência: null (nunca inventa)", () => {
    const cuts = [{ original_start: 100, original_end: 130, new_start: 2, new_end: 32 }];
    expect(resolveClipSourceRange({ start: 50, end: 80 }, { kind: "remapped-cuts", cuts })).toEqual({
      sourceStartTime: null,
      sourceEndTime: null,
    });
    expect(resolveClipSourceRange({ start: 2, end: 32 }, { kind: "remapped-cuts", cuts: undefined })).toEqual({
      sourceStartTime: null,
      sourceEndTime: null,
    });
  });
});
