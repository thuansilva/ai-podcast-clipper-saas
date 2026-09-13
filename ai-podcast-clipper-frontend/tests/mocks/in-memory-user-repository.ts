import type { UserEntity } from "~/domain/entities/user";
import { InsufficientCreditsError } from "~/domain/errors/insufficient-credits-error";
import { DomainError } from "~/domain/errors/domain-error";
import { NotFoundError } from "~/domain/errors/not-found-error";
import type {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  CreditsUpdateInput,
} from "~/domain/ports/user-repository";

export class InMemoryUserRepository implements IUserRepository {
  public users: Map<string, UserEntity> = new Map();

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
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

  async create(data: CreateUserData): Promise<UserEntity> {
    const user: UserEntity = {
      id: data.id,
      email: data.email,
      name: data.name ?? null,
      image: data.image ?? null,
      stripeCustomerId: data.stripeCustomerId ?? null,
      credits: data.credits ?? 10,
      reservedCredits: data.reservedCredits ?? 0,
      plan: data.plan ?? "STARTER",
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(userId: string, data: UpdateUserData): Promise<UserEntity> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const updated: UserEntity = {
      ...user,
      ...(data.email !== undefined && { email: data.email }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.image !== undefined && { image: data.image }),
      ...(data.stripeCustomerId !== undefined && {
        stripeCustomerId: data.stripeCustomerId,
      }),
      ...(data.plan !== undefined && { plan: data.plan }),
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateCredits(
    userId: string,
    data: CreditsUpdateInput
  ): Promise<UserEntity> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundError("Usuário", userId);
    }

    if (
      data.creditsDecrement !== undefined &&
      user.credits < data.creditsDecrement
    ) {
      throw new InsufficientCreditsError(data.creditsDecrement, user.credits);
    }

    if (
      data.reservedCreditsDecrement !== undefined &&
      user.reservedCredits < data.reservedCreditsDecrement
    ) {
      throw new DomainError(
        `Saldo insuficiente de créditos reservados: necessários ${data.reservedCreditsDecrement}, disponíveis ${user.reservedCredits}.`
      );
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
