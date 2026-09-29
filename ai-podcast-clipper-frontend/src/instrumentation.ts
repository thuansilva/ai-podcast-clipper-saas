import { registerOTel } from "@vercel/otel";
import { logs } from "@opentelemetry/api-logs";
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "ai-podcast-clipper-frontend";

/**
 * Next.js chama register() uma vez por instância do servidor, para os
 * runtimes node e edge. Só instrumentamos o runtime node: o exporter OTLP
 * usado aqui (HTTP) e o SDK de logs não rodam no edge.
 *
 * Endpoint do collector nunca é hardcoded aqui — @vercel/otel e o
 * OTLPLogExporter já leem OTEL_EXPORTER_OTLP_ENDPOINT (e as variantes
 * _TRACES_/_LOGS_ENDPOINT) do ambiente por padrão.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  registerOTel({ serviceName: SERVICE_NAME });

  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": SERVICE_NAME }),
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
}
