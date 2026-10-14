import { describe, it, expect } from "vitest";
import { formatClipsDurationLabel } from "~/domain/services/clip-duration.service";

describe("formatClipsDurationLabel", () => {
  it("formata a duração total (em segundos) em minutos arredondados para baixo", () => {
    expect(formatClipsDurationLabel(1200)).toBe("20 min de cortes gerados");
  });

  it("trata segundos que não completam um minuto como 0 min", () => {
    expect(formatClipsDurationLabel(45)).toBe("0 min de cortes gerados");
  });

  it("trata null/undefined (aggregate sem nenhum clipe) como 0 min, sem lançar erro", () => {
    expect(formatClipsDurationLabel(null)).toBe("0 min de cortes gerados");
    expect(formatClipsDurationLabel(undefined)).toBe("0 min de cortes gerados");
  });

  it("nunca retorna minutos negativos mesmo com entrada negativa inválida", () => {
    expect(formatClipsDurationLabel(-100)).toBe("0 min de cortes gerados");
  });

  it("soma de muitos clipes pequenos também é formatada corretamente", () => {
    // 15 clipes de 10, 20, 30... 150s = 1200s = 20min, cenário do teste de
    // integração com paginação (CLIPS_PER_PAGE = 10).
    const total = Array.from({ length: 15 }, (_, i) => (i + 1) * 10).reduce(
      (sum, d) => sum + d,
      0,
    );
    expect(formatClipsDurationLabel(total)).toBe("20 min de cortes gerados");
  });
});
