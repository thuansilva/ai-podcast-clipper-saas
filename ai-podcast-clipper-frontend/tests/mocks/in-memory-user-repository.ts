import type { UserEntity } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";

export class InMemoryUserRepository implements IUserRepository {
  public users: Map<string, UserEntity> = new Map();

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<UserEntity | null> {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === stripeCustomerId) {
        return user;
      }
    }
    return null;
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, { ...user });
    return this.users.get(user.id)!;
  }

  async updateCredits(
    userId: string,
    data: {
      creditsDecrement?: number;
      creditsIncrement?: number;
      reservedCreditsIncrement?: number;
      reservedCreditsDecrement?: number;
    }
  ): Promise<UserEntity> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const updated: UserEntity = {
      ...user,
      credits:
        user.credits -
        (data.creditsDecrement ?? 0) +
        (data.creditsIncrement ?? 0),
      reservedCredits:
        user.reservedCredits +
        (data.reservedCreditsIncrement ?? 0) -
        (data.reservedCreditsDecrement ?? 0),
    };

    this.users.set(userId, updated);
    return updated;
  }
}
