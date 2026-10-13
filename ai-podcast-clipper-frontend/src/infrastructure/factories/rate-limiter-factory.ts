import type { IRateLimiter } from "~/domain/ports/rate-limiter";
import { InMemorySlidingWindowRateLimiter } from "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter";
import { UpstashRedisRateLimiter } from "~/infrastructure/rate-limiting/upstash-redis-rate-limiter";
import { env } from "~/env";

/**
 * Escolhe a implementação de `IRateLimiter` com base na presença das env
 * vars do Upstash:
 * - Ambas configuradas (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
 *   → `UpstashRedisRateLimiter`, com estado compartilhado entre
 *   instâncias/processos (correto em serverless/múltiplas réplicas).
 * - Qualquer uma ausente → `InMemorySlidingWindowRateLimiter`
 *   (comportamento de hoje, por instância). Não lança erro: é o esperado em
 *   dev/CI, que não têm uma conta Upstash configurada.
 */
function createRateLimiter(limit: number, windowMs: number): IRateLimiter {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedisRateLimiter(limit, windowMs);
  }
  return new InMemorySlidingWindowRateLimiter(limit, windowMs);
}

// Unlike other factories in this codebase, these MUST be module-level
// singletons: a rate limiter's state has to persist across calls within the
// same server process, otherwise every call would start with an empty
// counter and nothing would ever be limited. (This still holds with
// UpstashRedisRateLimiter: the state that matters lives in Redis, but we
// still want a single client/instance per limiter, not one per call.)
const uploadUrlRateLimiter = createRateLimiter(10, 60_000);
const youtubeImportRateLimiter = createRateLimiter(5, 60_000);
// Mais permissivo que o de import: é só leitura de metadata (preview), não
// dispara processamento/custos de GPU.
const youtubeInfoRateLimiter = createRateLimiter(20, 60_000);
// Delete/rename/retry são operações baratas e frequentes no uso normal do
// dashboard (ex.: renomear várias vezes seguidas); limite mais permissivo
// que o de importação, só pra conter automação/abuso, não o uso legítimo.
const projectActionRateLimiter = createRateLimiter(20, 60_000);
// Checkout/portal do Stripe criam sessões reais na API do Stripe a cada
// chamada; limite mais restritivo que o de projeto pra evitar loop de
// criação de sessões (custo/abuso na API do Stripe).
const billingActionRateLimiter = createRateLimiter(5, 60_000);

export function makeUploadUrlRateLimiter(): IRateLimiter {
  return uploadUrlRateLimiter;
}

export function makeYouTubeImportRateLimiter(): IRateLimiter {
  return youtubeImportRateLimiter;
}

export function makeYouTubeInfoRateLimiter(): IRateLimiter {
  return youtubeInfoRateLimiter;
}

export function makeProjectActionRateLimiter(): IRateLimiter {
  return projectActionRateLimiter;
}

export function makeBillingActionRateLimiter(): IRateLimiter {
  return billingActionRateLimiter;
}
