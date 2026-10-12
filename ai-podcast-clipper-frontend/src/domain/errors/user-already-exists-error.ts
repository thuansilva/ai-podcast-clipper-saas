import { DomainError } from "./domain-error";

/**
 * Lançado pelo repositório de usuários quando uma tentativa de `create()`
 * colide com um usuário que já existe (constraint de unicidade violada —
 * tipicamente o `id` do Clerk, já inserido por uma chamada concorrente).
 *
 * Existe para que a camada de aplicação (`SyncUserUseCase`) possa tratar essa
 * corrida de forma deliberadamente idempotente, sem depender de detalhes de
 * infraestrutura (ex.: código `P2002` do Prisma) dentro do domínio.
 */
export class UserAlreadyExistsError extends DomainError {
  constructor(public readonly identifier: string) {
    super(`Usuário com identificador '${identifier}' já existe.`);
  }
}
