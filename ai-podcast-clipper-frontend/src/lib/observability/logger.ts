import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { trace } from "@opentelemetry/api";

const otelLogger = logs.getLogger("ai-podcast-clipper-frontend");

type LogFields = Record<string, unknown>;
type OtelAttributes = Record<string, string | number | boolean>;

function sanitizeFields(fields: LogFields): OtelAttributes {
  const out: OtelAttributes = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      out[`${key}.message`] = value.message;
      if (value.stack) out[`${key}.stack`] = value.stack;
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    } else if (value !== undefined && value !== null) {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

/**
 * Log estruturado que sai por dois canais:
 * 1. OTLP (via @opentelemetry/api-logs) -> otel-collector -> Loki, com o
 *    traceId do span ativo anexado como atributo, pra correlacionar log com
 *    trace no Grafana (Tempo "Logs for this span" / Loki query by traceId).
 * 2. stdout em JSON, útil pra debug local sem precisar abrir o Grafana.
 */
function emit(
  severityNumber: SeverityNumber,
  severityText: "INFO" | "WARN" | "ERROR",
  message: string,
  fields: LogFields = {}
) {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  const attributes = sanitizeFields(fields);
  if (traceId) attributes.traceId = traceId;

  otelLogger.emit({
    severityNumber,
    severityText,
    body: message,
    attributes,
  });

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: severityText.toLowerCase(),
    message,
    ...attributes,
  });

  if (severityText === "ERROR") console.error(line);
  else if (severityText === "WARN") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) =>
    emit(SeverityNumber.INFO, "INFO", message, fields),
  warn: (message: string, fields?: LogFields) =>
    emit(SeverityNumber.WARN, "WARN", message, fields),
  error: (message: string, fields?: LogFields) =>
    emit(SeverityNumber.ERROR, "ERROR", message, fields),
};
