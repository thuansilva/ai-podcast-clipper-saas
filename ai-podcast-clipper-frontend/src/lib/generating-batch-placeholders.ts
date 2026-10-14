import { formatTimeInput } from "~/lib/time-format";

/**
 * View-model dos cards "gerando…" exibidos na tela de detalhes do projeto
 * enquanto há `ProjectProcessingBatch` em `queued`/`processing`. Função pura:
 * lê o `rangesJson` (Json do Prisma, não confiável) de forma defensiva.
 */
export interface GeneratingBatchInput {
  id: string;
  mode: string;
  status: string;
  rangesJson: unknown;
}

export interface GeneratingPlaceholder {
  key: string;
  kind: "manual" | "auto";
  status: "queued" | "processing";
  /** Título do corte pedido (manual) ou "IA analisando" (auto); null se não houver. */
  title: string | null;
  /** "mm:ss – mm:ss" no vídeo original; "" se o intervalo for ilegível. */
  rangeLabel: string;
}

function isRange(value: unknown): value is { startTime: number; endTime: number; title?: unknown } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.startTime === "number" &&
    typeof v.endTime === "number" &&
    Number.isFinite(v.startTime) &&
    Number.isFinite(v.endTime)
  );
}

function rangeLabel(start: number, end: number): string {
  return `${formatTimeInput(start)} – ${formatTimeInput(end)}`;
}

export function buildGeneratingPlaceholders(
  batches: GeneratingBatchInput[],
): GeneratingPlaceholder[] {
  const result: GeneratingPlaceholder[] = [];

  for (const batch of batches) {
    const status = batch.status === "processing" ? "processing" : "queued";

    if (batch.mode === "auto") {
      const range = isRange(batch.rangesJson) ? batch.rangesJson : null;
      result.push({
        key: `${batch.id}-auto`,
        kind: "auto",
        status,
        title: "IA analisando",
        rangeLabel: range ? rangeLabel(range.startTime, range.endTime) : "",
      });
      continue;
    }

    const cuts = Array.isArray(batch.rangesJson)
      ? batch.rangesJson.filter(isRange)
      : [];
    if (cuts.length === 0) {
      result.push({
        key: `${batch.id}-0`,
        kind: "manual",
        status,
        title: null,
        rangeLabel: "",
      });
      continue;
    }
    cuts.forEach((cut, index) => {
      const title = typeof cut.title === "string" ? cut.title.trim() : "";
      result.push({
        key: `${batch.id}-${index}`,
        kind: "manual",
        status,
        title: title || null,
        rangeLabel: rangeLabel(cut.startTime, cut.endTime),
      });
    });
  }

  return result;
}

export function describeGeneratingBanner(
  placeholders: GeneratingPlaceholder[],
): string {
  if (placeholders.length > 0 && placeholders.every((p) => p.kind === "auto")) {
    return "A IA está analisando o trecho selecionado…";
  }
  const n = placeholders.length;
  return `Gerando ${n} ${n === 1 ? "corte" : "cortes"}…`;
}
