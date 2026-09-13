import type { IAuthGateway } from "~/domain/ports/auth-gateway";
import { ClerkAuthGateway } from "../auth/clerk-auth.gateway";

export function makeAuthGateway(): IAuthGateway {
  return new ClerkAuthGateway();
}
