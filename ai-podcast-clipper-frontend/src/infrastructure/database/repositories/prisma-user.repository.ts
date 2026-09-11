import { db } from "~/server/db";
import type { UserEntity } from "~/domain/entities/user";
import type { IUserRepository } from "~/domain/ports/user-repository";

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
    };
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
    };
  }
}
