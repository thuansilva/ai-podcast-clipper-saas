import { describe, it, expect } from "vitest";
import {
  analyzeManualCutRows,
  type ManualCutRow,
} from "~/lib/manual-cut-rows";
import {
  MAX_MANUAL_CUT_DURATION_SECONDS,
  MAX_MANUAL_CUTS,
} from "~/domain/schemas/manual-cut.schema";

const row = (id: string, start: string, end: string, title = ""): ManualCutRow => ({
  id,
  start,
  end,
  title,
});

describe("analyzeManualCutRows", () => {
  it("converte linhas válidas em cortes em segundos, com id e título", () => {
    const r = analyzeManualCutRows([row("a", "01:00", "01:30", " Intro ")], 600);
    expect(r.cuts).toEqual([
      { id: "a", title: "Intro", startTime: 60, endTime: 90 },
    ]);
    expect(r.allValid).toBe(true);
    expect(r.rows[0]).toMatchObject({ startError: null, endError: null, titleError: null, overlapWarning: null, incomplete: false });
  });

  it("omite o título quando vazio", () => {
    const r = analyzeManualCutRows([row("a", "0:00", "0:10")], 600);
    expect(r.cuts[0]).toEqual({ id: "a", startTime: 0, endTime: 10 });
  });

  it("linha vazia é incompleta, sem mensagem de erro e invalida o conjunto", () => {
    const r = analyzeManualCutRows([row("a", "", "")], 600);
    expect(r.rows[0]!.incomplete).toBe(true);
    expect(r.rows[0]!.startError).toBeNull();
    expect(r.rows[0]!.endError).toBeNull();
    expect(r.cuts).toEqual([]);
    expect(r.allValid).toBe(false);
  });

  it("formato inválido em início e fim", () => {
    const r = analyzeManualCutRows([row("a", "abc", "1:2")], 600);
    expect(r.rows[0]!.startError).toMatch(/formato/i);
    expect(r.rows[0]!.endError).toMatch(/formato/i);
    expect(r.allValid).toBe(false);
  });

  it("fim igual ou antes do início", () => {
    expect(analyzeManualCutRows([row("a", "01:00", "01:00")], 600).rows[0]!.endError).toMatch(/depois do início/i);
    expect(analyzeManualCutRows([row("a", "01:00", "00:30")], 600).rows[0]!.endError).toMatch(/depois do início/i);
  });

  it("duração acima do limite (derivado da constante do schema)", () => {
    const over = analyzeManualCutRows([row("a", "00:00", "01:01")], 600);
    expect(over.rows[0]!.endError).toContain(`${MAX_MANUAL_CUT_DURATION_SECONDS}`);
    const exact = analyzeManualCutRows([row("a", "00:00", "01:00")], 600);
    expect(exact.rows[0]!.endError).toBeNull();
    expect(exact.allValid).toBe(true);
  });

  it("fim depois da duração do vídeo", () => {
    const r = analyzeManualCutRows([row("a", "09:50", "10:10")], 600);
    expect(r.rows[0]!.endError).toMatch(/duração do vídeo/i);
    expect(analyzeManualCutRows([row("a", "09:50", "10:00")], 600).allValid).toBe(true);
  });

  it("início depois da duração do vídeo", () => {
    const r = analyzeManualCutRows([row("a", "11:00", "11:10")], 600);
    expect(r.rows[0]!.startError).toMatch(/duração do vídeo/i);
  });

  it("sobreposição gera aviso não bloqueante nas duas linhas", () => {
    const r = analyzeManualCutRows(
      [row("a", "00:00", "00:30"), row("b", "00:20", "00:50"), row("c", "01:00", "01:10")],
      600,
    );
    expect(r.rows[0]!.overlapWarning).toMatch(/corte 2/i);
    expect(r.rows[1]!.overlapWarning).toMatch(/corte 1/i);
    expect(r.rows[2]!.overlapWarning).toBeNull();
    expect(r.allValid).toBe(true);
    expect(r.cuts).toHaveLength(3);
  });

  it("cortes adjacentes (fim == início do próximo) não contam como sobreposição", () => {
    const r = analyzeManualCutRows([row("a", "00:00", "00:30"), row("b", "00:30", "01:00")], 600);
    expect(r.rows[0]!.overlapWarning).toBeNull();
    expect(r.rows[1]!.overlapWarning).toBeNull();
  });

  it("só linhas válidas entram em cuts; allValid false se alguma for inválida", () => {
    const r = analyzeManualCutRows([row("a", "00:00", "00:10"), row("b", "x", "y")], 600);
    expect(r.cuts).toHaveLength(1);
    expect(r.allValid).toBe(false);
  });

  it("título acima de 200 caracteres é inválido", () => {
    const r = analyzeManualCutRows([row("a", "00:00", "00:10", "x".repeat(201))], 600);
    expect(r.rows[0]!.titleError).toBeTruthy();
    expect(r.allValid).toBe(false);
  });

  it("sem linhas: não é válido", () => {
    expect(analyzeManualCutRows([], 600).allValid).toBe(false);
  });

  it("expõe o limite de cortes da constante do schema", () => {
    expect(MAX_MANUAL_CUTS).toBe(50);
  });
});
