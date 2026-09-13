import { auth, currentUser } from "@clerk/nextjs/server";
import type { IAuthGateway, AuthUser } from "~/domain/ports/auth-gateway";
import { UnauthorizedError } from "~/domain/errors/unauthorized-error";

export class ClerkAuthGateway implements IAuthGateway {
  async getUserId(): Promise<string | null> {
    const session = await auth();
    return session.userId ?? null;
  }

  async requireUserId(): Promise<string> {
    const session = await auth();
    if (!session.userId) {
      throw new UnauthorizedError("Usuário não autenticado.");
    }
    return session.userId;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const user = await currentUser();
    if (!user) return null;

    const primaryEmail = user.emailAddresses[0]?.emailAddress ?? "";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");

    return {
      id: user.id,
      email: primaryEmail,
      name: fullName || null,
      imageUrl: user.imageUrl ?? null,
    };
  }
}
