import { db } from "~/server/db";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export class PrismaUnitOfWork implements IUnitOfWork {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return await db.$transaction(async () => {
      return await operation();
    });
  }
}
