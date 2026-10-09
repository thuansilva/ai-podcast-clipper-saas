import { db, dbTransactionContext } from "~/server/db";
import type { IUnitOfWork } from "~/domain/ports/unit-of-work";

export class PrismaUnitOfWork implements IUnitOfWork {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return await db.$transaction(
      async (tx) => {
        // Propaga o `TransactionClient` aberto para o `AsyncLocalStorage`
        // consultado pelo Proxy de `db` (src/server/db.ts). Assim, qualquer
        // `db.*` chamado DENTRO de `operation()` pelos repositórios (que
        // importam `db` diretamente, não recebem `tx` por parâmetro) é
        // automaticamente redirecionado para esta transação, garantindo que
        // todas as escritas da unidade de trabalho sejam comitadas ou
        // revertidas juntas.
        return await dbTransactionContext.run({ tx }, operation);
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }
}
