import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export class InMemoryUnitOfWork implements IUnitOfWork {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return await operation();
  }
}
