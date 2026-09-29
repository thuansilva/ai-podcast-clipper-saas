import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";

export const tracer = trace.getTracer("ai-podcast-clipper-frontend");

/**
 * Injeta o header `traceparent` (W3C Trace Context) do span ativo num objeto
 * de headers, pra chamadas HTTP saintes continuarem o mesmo trace do lado de
 * quem recebe (ex.: o backend Python). Necessário para chamadas feitas com
 * `undici.fetch` importado diretamente — diferente do `fetch` global, ele
 * não é coberto pela auto-instrumentação de fetch do Next.js/@vercel/otel,
 * então sem isso o backend abriria um trace novo e desconectado a cada
 * chamada, em vez de continuar o trace do Inngest.
 */
export function injectTraceHeaders(
  headers: Record<string, string>
): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

type SpanAttributes = Record<string, string | number | boolean>;

/**
 * Roda `fn` dentro de um span filho do span ativo, marcando erro/sucesso e
 * sempre chamando span.end(). Use para dar granularidade a um passo
 * específico (ex.: um step do Inngest, uma etapa de um webhook) além do que
 * a auto-instrumentação do Next.js já cobre.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
