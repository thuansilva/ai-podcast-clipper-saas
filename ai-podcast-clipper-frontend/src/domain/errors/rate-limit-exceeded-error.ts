import { DomainError } from "./domain-error";

export class RateLimitExceededError extends DomainError {
  constructor(message = "Too many requests. Please try again in a minute.") {
    super(message);
  }
}
