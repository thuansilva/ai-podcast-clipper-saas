import { AsyncLocalStorage } from "node:async_hooks";

import { PrismaClient, type Prisma } from "@prisma/client";

import { env } from "~/env";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

const rawDb = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;

/**
 * Escopo de transação de teste do contexto assíncrono atual (usado apenas por
 * `tests/helpers/with-rollback-transaction.ts`). O `tx` é preenchido depois
 * que a transação abre; enquanto estiver `undefined`, `db` usa o client real.
 * Fora de testes o store nunca é preenchido, então `db` delega ao client real.
 *
 * O escopo é um objeto mutável (e não o próprio TransactionClient) para que
 * ele possa ser registrado de forma síncrona num hook do Vitest, antes de a
 * transação existir: `enterWith` só chega ao corpo do teste se for chamado
 * no mesmo contexto síncrono do runner.
 */
export type DbTransactionScope = { tx?: Prisma.TransactionClient };

export const dbTransactionContext = new AsyncLocalStorage<DbTransactionScope>();

type DbTarget = typeof rawDb;

const boundFunctionCache = new Map<PropertyKey, unknown>();
let savepointCounter = 0;

/**
 * `$transaction` dentro de uma transação de teste não pode abrir outra
 * transação (Prisma não suporta aninhamento no TransactionClient). Nesse caso
 * usamos SAVEPOINT para manter a semântica de atomicidade do bloco interno:
 * se o callback falhar, só as escritas dele são desfeitas.
 */
const nestedTransaction =
  (tx: Prisma.TransactionClient) =>
  async (arg: unknown): Promise<unknown> => {
    if (typeof arg !== "function") {
      return Promise.all(arg as Promise<unknown>[]);
    }
    const savepoint = `test_sp_${++savepointCounter}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
    try {
      const result: unknown = await (
        arg as (client: Prisma.TransactionClient) => Promise<unknown>
      )(tx);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      throw error;
    }
  };

/**
 * Proxy sobre o client Prisma real.
 *
 * - Sem transação de teste ativa (produção/dev): cada propriedade é lida do
 *   client real, com funções vinculadas a ele e cacheadas (identidade estável).
 * - Com transação de teste ativa (`dbTransactionContext`): tudo é lido da
 *   transação, e `$transaction` vira savepoint dentro dela.
 */
export const db: DbTarget = new Proxy(rawDb, {
  get(target, prop) {
    const tx = dbTransactionContext.getStore()?.tx;

    if (tx === undefined) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (!boundFunctionCache.has(prop)) {
        boundFunctionCache.set(prop, value.bind(target));
      }
      return boundFunctionCache.get(prop);
    }

    if (prop === "$transaction") return nestedTransaction(tx);

    if (prop in tx) {
      const value: unknown = Reflect.get(tx, prop, tx);
      return typeof value === "function" ? value.bind(tx) : value;
    }

    const value: unknown = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
