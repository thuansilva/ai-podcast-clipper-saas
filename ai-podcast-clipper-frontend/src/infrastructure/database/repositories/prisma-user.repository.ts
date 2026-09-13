import { db } from "~/server/db";
import type { UserEntity } from "~/domain/entities/user";
import type {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  CreditsUpdateInput,
} from "~/domain/ports/user-repository";

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async findByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<UserEntity | null> {
    const user = await db.user.findUnique({
      where: { stripeCustomerId },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const user = await db.user.create({
      data: {
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        image: data.image ?? null,
        stripeCustomerId: data.stripeCustomerId ?? null,
        credits: data.credits ?? 10,
        reservedCredits: data.reservedCredits ?? 0,
        plan: data.plan ?? "STARTER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async update(userId: string, data: UpdateUserData): Promise<UserEntity> {
    const user = await db.user.update({
      where: { id: userId },
      data: {
        ...(data.email !== undefined && { email: data.email }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.image !== undefined && { image: data.image }),
        ...(data.stripeCustomerId !== undefined && {
          stripeCustomerId: data.stripeCustomerId,
        }),
        ...(data.plan !== undefined && { plan: data.plan }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async updateCredits(
    userId: string,
    data: CreditsUpdateInput
  ): Promise<UserEntity> {
    const user = await db.user.update({
      where: { id: userId },
      data: {
        ...(data.creditsDecrement !== undefined && {
          credits: { decrement: data.creditsDecrement },
        }),
        ...(data.creditsIncrement !== undefined && {
          credits: { increment: data.creditsIncrement },
        }),
        ...(data.reservedCreditsIncrement !== undefined && {
          reservedCredits: { increment: data.reservedCreditsIncrement },
        }),
        ...(data.reservedCreditsDecrement !== undefined && {
          reservedCredits: { decrement: data.reservedCreditsDecrement },
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        reservedCredits: true,
        stripeCustomerId: true,
        image: true,
        plan: true,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      credits: user.credits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }
}
