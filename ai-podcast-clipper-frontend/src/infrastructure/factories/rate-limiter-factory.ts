import type { IRateLimiter } from "~/domain/ports/rate-limiter";
import { InMemorySlidingWindowRateLimiter } from "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter";

// Unlike other factories in this codebase, these MUST be module-level
// singletons: a rate limiter's state has to persist across calls within the
// same server process, otherwise every call would start with an empty
// counter and nothing would ever be limited.
const uploadUrlRateLimiter = new InMemorySlidingWindowRateLimiter(10, 60_000);
const youtubeImportRateLimiter = new InMemorySlidingWindowRateLimiter(5, 60_000);
// Mais permissivo que o de import: é só leitura de metadata (preview), não
// dispara processamento/custos de GPU.
const youtubeInfoRateLimiter = new InMemorySlidingWindowRateLimiter(20, 60_000);
// Delete/rename/retry são operações baratas e frequentes no uso normal do
// dashboard (ex.: renomear várias vezes seguidas); limite mais permissivo
// que o de importação, só pra conter automação/abuso, não o uso legítimo.
const projectActionRateLimiter = new InMemorySlidingWindowRateLimiter(20, 60_000);
// Checkout/portal do Stripe criam sessões reais na API do Stripe a cada
// chamada; limite mais restritivo que o de projeto pra evitar loop de
// criação de sessões (custo/abuso na API do Stripe).
const billingActionRateLimiter = new InMemorySlidingWindowRateLimiter(5, 60_000);

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
