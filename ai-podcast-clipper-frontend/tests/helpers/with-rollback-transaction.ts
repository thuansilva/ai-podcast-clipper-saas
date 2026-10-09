/**
 * Isolamento de testes de integração por transação com rollback.
 *
 * Cada teste roda dentro de uma transação Postgres que é SEMPRE revertida no
 * fim. O código de produção não precisa saber disso: `db` (src/server/db.ts)
 * consulta `dbTransactionContext` e, quando há transação de teste ativa,
 * executa as queries nela.
 *
 * Uso recomendado (uma linha no topo do describe ou do arquivo):
 *
 *   describe("...", () => {
 *     useRollbackTransactionPerTest();
 *     it("...", async () => { ... });
 *   });
 */

import { aroundEach } from "vitest";

import { db, dbTransactionContext } from "~/server/db";

/** Timeout da transação interativa do Prisma (padrão do Prisma é 5s). */
const TRANSACTION_OPTIONS = {
  timeout: 60_000,
  maxWait: 10_000,
} as const;

class RollbackSentinel extends Error {
  constructor() {
    super("ROLLBACK_TEST_TRANSACTION");
    this.name = "RollbackSentinel";
  }
}

const isRollbackSentinel = (error: unknown): boolean =>
  error instanceof RollbackSentinel;

/**
 * Executa `fn` dentro de uma transação revertida ao final.
 * Erros reais do teste (asserções, falhas de código) propagam normalmente;
 * só o sentinel de rollback é engolido.
 */
export async function withRollbackTransaction(
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await dbTransactionContext.run({ tx }, fn);
      throw new RollbackSentinel();
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (!isRollbackSentinel(error)) throw error;
  }
}

/**
 * Registra um `aroundEach` que executa cada teste do arquivo/describe dentro
 * de uma transação revertida. O `aroundEach` envolve a execução do teste no
 * próprio runner do Vitest, então o contexto assíncrono (AsyncLocalStorage)
 * é herdado pelo corpo do teste e pelos hooks.
 */
export function useRollbackTransactionPerTest(): void {
  aroundEach(async (runTest) => {
    await withRollbackTransaction(async () => {
      await runTest();
    });
  });
}
