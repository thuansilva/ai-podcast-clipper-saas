import type { IRateLimiter } from "~/domain/ports/rate-limiter";
import { InMemorySlidingWindowRateLimiter } from "~/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter";

// Unlike other factories in this codebase, these MUST be module-level
// singletons: a rate limiter's state has to persist across calls within the
// same server process, otherwise every call would start with an empty
// counter and nothing would ever be limited.
const uploadUrlRateLimiter = new InMemorySlidingWindowRateLimiter(10, 60_000);
const youtubeImportRateLimiter = new InMemorySlidingWindowRateLimiter(5, 60_000);

export function makeUploadUrlRateLimiter(): IRateLimiter {
  return uploadUrlRateLimiter;
}

export function makeYouTubeImportRateLimiter(): IRateLimiter {
  return youtubeImportRateLimiter;
}
