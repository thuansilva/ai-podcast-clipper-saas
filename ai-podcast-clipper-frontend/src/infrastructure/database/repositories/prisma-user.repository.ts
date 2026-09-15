import { db } from "~/server/db";
import type { Prisma } from "@prisma/client";
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

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        subscriptionCredits: true,
        oneTimeCredits: true,
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
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
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
        subscriptionCredits: true,
        oneTimeCredits: true,
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
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
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
        subscriptionCredits: true,
        oneTimeCredits: true,
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
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
      reservedCredits: user.reservedCredits,
      stripeCustomerId: user.stripeCustomerId,
      image: user.image,
      plan: user.plan,
    };
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const subCredits = data.subscriptionCredits ?? 0;
    const otCredits = data.oneTimeCredits ?? 10;
    const totalCredits = data.credits ?? (subCredits + otCredits);

    const user = await db.user.create({
      data: {
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        image: data.image ?? null,
        stripeCustomerId: data.stripeCustomerId ?? null,
        credits: totalCredits,
        subscriptionCredits: subCredits,
        oneTimeCredits: otCredits,
        reservedCredits: data.reservedCredits ?? 0,
        plan: data.plan ?? "STARTER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        subscriptionCredits: true,
        oneTimeCredits: true,
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
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
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
        ...(data.credits !== undefined && { credits: data.credits }),
        ...(data.subscriptionCredits !== undefined && {
          subscriptionCredits: data.subscriptionCredits,
        }),
        ...(data.oneTimeCredits !== undefined && {
          oneTimeCredits: data.oneTimeCredits,
        }),
        ...(data.reservedCredits !== undefined && {
          reservedCredits: data.reservedCredits,
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        subscriptionCredits: true,
        oneTimeCredits: true,
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
      subscriptionCredits: user.subscriptionCredits,
      oneTimeCredits: user.oneTimeCredits,
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
    const whereConditions: Prisma.UserWhereInput = { id: userId };

    if (data.creditsDecrement !== undefined) {
      whereConditions.credits = { gte: data.creditsDecrement };
    }
    if (data.reservedCreditsDecrement !== undefined) {
      whereConditions.reservedCredits = { gte: data.reservedCreditsDecrement };
    }
    if (data.subscriptionCreditsDecrement !== undefined) {
      whereConditions.subscriptionCredits = {
        gte: data.subscriptionCreditsDecrement,
      };
    }
    if (data.oneTimeCreditsDecrement !== undefined) {
      whereConditions.oneTimeCredits = {
        gte: data.oneTimeCreditsDecrement,
      };
    }

    const updateData: Prisma.UserUpdateInput = {
      ...(data.creditsDecrement !== undefined && {
        credits: { decrement: data.creditsDecrement },
      }),
      ...(data.creditsIncrement !== undefined && {
        credits: { increment: data.creditsIncrement },
      }),
      ...(data.creditsSet !== undefined && {
        credits: data.creditsSet,
      }),
      ...(data.reservedCreditsIncrement !== undefined && {
        reservedCredits: { increment: data.reservedCreditsIncrement },
      }),
      ...(data.reservedCreditsDecrement !== undefined && {
        reservedCredits: { decrement: data.reservedCreditsDecrement },
      }),
      ...(data.subscriptionCreditsDecrement !== undefined && {
        subscriptionCredits: { decrement: data.subscriptionCreditsDecrement },
      }),
      ...(data.subscriptionCreditsIncrement !== undefined && {
        subscriptionCredits: { increment: data.subscriptionCreditsIncrement },
      }),
      ...(data.subscriptionCreditsSet !== undefined && {
        subscriptionCredits: data.subscriptionCreditsSet,
      }),
      ...(data.oneTimeCreditsDecrement !== undefined && {
        oneTimeCredits: { decrement: data.oneTimeCreditsDecrement },
      }),
      ...(data.oneTimeCreditsIncrement !== undefined && {
        oneTimeCredits: { increment: data.oneTimeCreditsIncrement },
      }),
      ...(data.oneTimeCreditsSet !== undefined && {
        oneTimeCredits: data.oneTimeCreditsSet,
      }),
    };

    const updateResult = await db.user.updateMany({
      where: whereConditions,
      data: updateData,
    });

    if (updateResult.count === 0) {
      const current = await this.findById(userId);
      if (!current) {
        throw new NotFoundError("Usuário", userId);
      }
      if (
        data.creditsDecrement !== undefined &&
        current.credits < data.creditsDecrement
      ) {
        throw new InsufficientCreditsError(
          data.creditsDecrement,
          current.credits
        );
      }
      if (
        data.subscriptionCreditsDecrement !== undefined &&
        (current.subscriptionCredits ?? 0) < data.subscriptionCreditsDecrement
      ) {
        throw new InsufficientCreditsError(
          data.subscriptionCreditsDecrement,
          current.subscriptionCredits ?? 0
        );
      }
      if (
        data.oneTimeCreditsDecrement !== undefined &&
        (current.oneTimeCredits ?? 0) < data.oneTimeCreditsDecrement
      ) {
        throw new InsufficientCreditsError(
          data.oneTimeCreditsDecrement,
          current.oneTimeCredits ?? 0
        );
      }
      if (
        data.reservedCreditsDecrement !== undefined &&
        current.reservedCredits < data.reservedCreditsDecrement
      ) {
        throw new DomainError(
          `Saldo insuficiente de créditos reservados: necessários ${data.reservedCreditsDecrement}, disponíveis ${current.reservedCredits}.`
        );
      }
      throw new DomainError("Falha ao atualizar créditos do usuário.");
    }

    const updated = await this.findById(userId);
    if (!updated) {
      throw new NotFoundError("Usuário", userId);
    }

    return updated;
  }
}
