/**
 * @vitest-environment node
 *
 * Prova de atomicidade real do `PrismaUnitOfWork`
 * (src/infrastructure/database/repositories/prisma-unit-of-work.ts).
 *
 * Bug original: `db.$transaction(async () => operation())` ignorava o
 * `TransactionClient` recebido no callback. Os repositórios usados dentro de
 * `operation()` (ex.: `PrismaUserRepository`, `PrismaCreditTransactionRepository`)
 * importam `db` global de `src/server/db.ts` diretamente — não o `tx` da
 * transação aberta. Resultado: cada escrita feita dentro de uma "unidade de
 * trabalho" comita isolada e imediatamente no banco real, sem rollback real
 * nenhum se uma escrita posterior falhar.
 *
 * IMPORTANTE: este teste NÃO usa `tests/helpers/with-rollback-transaction.ts`.
 * Rodar dentro da transação de isolamento de testes mascararia o bug: o
 * mecanismo de SAVEPOINT do Proxy em `db.ts` já garante atomicidade por si só
 * quando há uma transação de teste ativa no `AsyncLocalStorage`, independente
 * de o código de produção estar correto ou não (o SAVEPOINT engloba todas as
 * escritas feitas no mesmo contexto assíncrono, com ou sem o fix). Por isso,
 * assim como `tests/integration/credit-service.test.ts` (testes de
 * concorrência), este arquivo usa comprometimento real no Postgres de teste e
 * limpeza manual — é exatamente o cenário que expõe o comportamento real do
 * `PrismaUnitOfWork` em produção.
 */
import { describe, it, expect, afterEach } from "vitest";

import { db } from "~/server/db";
import { ConsumeCreditsUseCase } from "~/application/use-cases/credits/consume-credits.use-case";
import { PrismaUserRepository } from "~/infrastructure/database/repositories/prisma-user.repository";
import { PrismaUnitOfWork } from "~/infrastructure/database/repositories/prisma-unit-of-work";
import type {
  CreateCreditTransactionInput,
  ICreditTransactionRepository,
} from "~/domain/ports/credit-transaction-repository";
import type { CreditTransactionEntity } from "~/domain/entities/credit-transaction";

/**
 * Repositório de `CreditTransaction` que sempre falha em `create`, simulando
 * a SEGUNDA escrita de uma unidade de trabalho multi-passo falhando depois
 * que a PRIMEIRA escrita (débito de créditos do usuário) já foi executada
 * dentro do mesmo `unitOfWork.execute(...)`.
 */
class ThrowingCreditTransactionRepository implements ICreditTransactionRepository {
  create(
    _input: CreateCreditTransactionInput
  ): Promise<CreditTransactionEntity> {
    return Promise.reject(
      new Error(
        "Falha simulada na 2a escrita do unit of work (CreditTransaction.create)"
      )
    );
  }

  findByUserId(_userId: string): Promise<CreditTransactionEntity[]> {
    return Promise.resolve([]);
  }
}

describe("PrismaUnitOfWork — atomicidade real (sem mock de transação)", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(credits: number, subscriptionCredits: number) {
    const user = await db.user.create({
      data: {
        id: `user_uow_atomic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: `uow-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
        password: "hashedpassword123",
        credits,
        subscriptionCredits,
        oneTimeCredits: 0,
        reservedCredits: 0,
        plan: "STARTER",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await db.creditTransaction.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  it(
    "deve reverter a escrita anterior (débito de créditos) quando a escrita seguinte " +
      "(registro de CreditTransaction) falha dentro do mesmo unitOfWork.execute",
    async () => {
      const user = await createTestUser(10, 10);

      const useCase = new ConsumeCreditsUseCase(
        new PrismaUserRepository(),
        new ThrowingCreditTransactionRepository(),
        new PrismaUnitOfWork()
      );

      await expect(
        useCase.execute({
          userId: user.id,
          amount: 5,
          fileId: "file-unit-of-work-atomicity-test",
        })
      ).rejects.toThrow(/Falha simulada/);

      // Prova de atomicidade real: a primeira escrita (débito de créditos),
      // que já tinha sido executada com sucesso dentro do `operation()` antes
      // da segunda escrita falhar, precisa ter sido revertida junto.
      const freshUser = await db.user.findUnique({ where: { id: user.id } });
      expect(freshUser?.credits).toBe(10);
      expect(freshUser?.subscriptionCredits).toBe(10);
      expect(freshUser?.reservedCredits).toBe(0);

      const transactions = await db.creditTransaction.findMany({
        where: { userId: user.id },
      });
      expect(transactions).toHaveLength(0);
    }
  );
});
