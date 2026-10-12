/**
 * @vitest-environment node
 *
 * Testes de integração: idempotência deliberada do sync de usuário do
 * Clerk (`SyncUserUseCase` + `PrismaUserRepository`) contra Postgres real.
 *
 * Cobre o Bug 1 do checklist-go-live.md ("Webhook Clerk sem idempotência
 * deliberada"): duas entregas concorrentes do mesmo webhook `user.created`
 * podem ambas passar pelo `findById` inicial encontrando `null` antes de
 * qualquer uma terminar o `create()`. A segunda chamada precisa violar a
 * constraint de unicidade real do Postgres (PK `id`) e ser tratada de forma
 * idempotente, não propagar a exceção.
 */

import { describe, it, expect, afterAll } from "vitest";
import { db } from "~/server/db";
import { PrismaUserRepository } from "~/infrastructure/database/repositories/prisma-user.repository";
import { SyncUserUseCase } from "~/application/use-cases/users/sync-user.use-case";
import { UserAlreadyExistsError } from "~/domain/errors/user-already-exists-error";
import type {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  CreditsUpdateInput,
} from "~/domain/ports/user-repository";
import type { IPaymentGateway } from "~/domain/ports/payment-gateway";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

const uniqueId = (label: string) =>
  `user_clerk_webhook_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const uniqueEmail = (label: string) =>
  `clerk-webhook-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const fakePaymentGateway: IPaymentGateway = {
  async createCustomer() {
    return `cus_integration_test_${Date.now()}`;
  },
  async createCheckoutSession() {
    return "";
  },
  async createBillingPortalSession() {
    return "";
  },
};

/**
 * Decorador sobre o `PrismaUserRepository` real que força a "janela de
 * corrida" do Bug 1: a primeira chamada a `findById` sempre retorna `null`
 * (simulando duas entregas concorrentes do webhook que ainda não viram o
 * `create()` uma da outra), mas todas as outras operações (incluindo
 * `create`, que é onde a constraint de unicidade real do Postgres entra em
 * jogo) delegam para o repositório real.
 */
class RaceSimulatingUserRepository implements IUserRepository {
  private findByIdCalls = 0;

  constructor(private readonly real: PrismaUserRepository) {}

  async findById(id: string) {
    this.findByIdCalls++;
    if (this.findByIdCalls === 1) return null;
    return this.real.findById(id);
  }

  findByEmail(email: string) {
    return this.real.findByEmail(email);
  }

  findByStripeCustomerId(stripeCustomerId: string) {
    return this.real.findByStripeCustomerId(stripeCustomerId);
  }

  create(data: CreateUserData) {
    return this.real.create(data);
  }

  update(userId: string, data: UpdateUserData) {
    return this.real.update(userId, data);
  }

  updateCredits(userId: string, data: CreditsUpdateInput) {
    return this.real.updateCredits(userId, data);
  }
}

describe("PrismaUserRepository.create() - unicidade real (Postgres via transação revertida)", () => {
  useRollbackTransactionPerTest();

  it("traduz violação real de unicidade (P2002) em UserAlreadyExistsError", async () => {
    const repository = new PrismaUserRepository();
    const id = uniqueId("unique-constraint");
    const data: CreateUserData = {
      id,
      email: uniqueEmail("unique-constraint"),
      credits: 10,
      reservedCredits: 0,
    };

    await repository.create(data);

    await expect(
      repository.create({
        ...data,
        email: uniqueEmail("unique-constraint-2nd-attempt"),
      })
    ).rejects.toThrow(UserAlreadyExistsError);
  });
});

describe("SyncUserUseCase - corrida de condição do webhook do Clerk (Postgres real, sem rollback)", () => {
  // Este cenário precisa de uma violação de constraint REAL seguida de mais
  // queries na mesma chamada lógica (findById de reconciliação + update) —
  // exatamente como acontece em produção, onde não há uma transação externa
  // envolvendo a requisição do webhook. `useRollbackTransactionPerTest()`
  // não serve aqui: ela envolve o teste inteiro numa única transação, e o
  // Postgres aborta essa transação por completo no primeiro erro (até um
  // ROLLBACK/ROLLBACK TO SAVEPOINT explícito) — qualquer query seguinte
  // falharia com "current transaction is aborted", mascarando o próprio
  // comportamento que este teste quer provar. Por isso os commits são reais
  // aqui, com limpeza manual no `afterAll` (mesmo padrão de
  // `tests/integration/credit-service.test.ts`).
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it("não propaga a corrida de condição: trata o conflito de create() como 'já existe' e persiste o update real no Postgres", async () => {
    const realRepository = new PrismaUserRepository();
    const clerkUserId = uniqueId("race");
    const originalEmail = uniqueEmail("race-original");
    const updatedEmail = uniqueEmail("race-updated");
    createdUserIds.push(clerkUserId);

    // Simula a chamada concorrente que "venceu a corrida": já criou o
    // usuário de verdade no Postgres antes desta chamada terminar seu
    // próprio findById inicial.
    await db.user.create({
      data: {
        id: clerkUserId,
        email: originalEmail,
        name: "Nome Original",
        credits: 10,
        plan: "STARTER",
      },
    });

    const sut = new SyncUserUseCase(
      new RaceSimulatingUserRepository(realRepository),
      fakePaymentGateway
    );

    const result = await sut.execute({
      clerkUserId,
      email: updatedEmail,
      name: "Nome Atualizado Pós-Corrida",
    });

    expect(result.email).toBe(updatedEmail);
    expect(result.name).toBe("Nome Atualizado Pós-Corrida");

    const persisted = await db.user.findUnique({ where: { id: clerkUserId } });
    expect(persisted).not.toBeNull();
    expect(persisted!.email).toBe(updatedEmail);
    expect(persisted!.name).toBe("Nome Atualizado Pós-Corrida");
  });
});
