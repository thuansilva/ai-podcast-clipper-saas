/**
 * @vitest-environment node
 *
 * Testes do próprio mecanismo de isolamento por transação com rollback
 * (tests/helpers/with-rollback-transaction.ts + Proxy em src/server/db.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import {
  withRollbackTransaction,
  useRollbackTransactionPerTest,
} from "../helpers/with-rollback-transaction";

const uniqueEmail = (label: string) =>
  `rollback-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const createUser = (label: string) => {
  const data: Prisma.UserUncheckedCreateInput = {
    id: `user_rollback_${label}_${Math.random().toString(36).slice(2, 8)}`,
    email: uniqueEmail(label),
    password: "hashedpassword123",
    credits: 0,
    plan: "STARTER",
  };
  return db.user.create({ data });
};

describe("withRollbackTransaction", () => {
  it("mantém os dados durante o teste e reverte tudo ao final", async () => {
    const label = "fn-visible";
    let createdId = "";

    await withRollbackTransaction(async () => {
      const user = await createUser(label);
      createdId = user.id;
      const visible = await db.user.findUnique({ where: { id: user.id } });
      expect(visible).not.toBeNull();
    });

    const persisted = await db.user.findUnique({ where: { id: createdId } });
    expect(persisted).toBeNull();
  });

  it("propaga erros reais do teste (não engole asserções)", async () => {
    await expect(
      withRollbackTransaction(async () => {
        throw new Error("erro real do teste");
      }),
    ).rejects.toThrow("erro real do teste");
  });
});

describe("useRollbackTransactionPerTest", () => {
  useRollbackTransactionPerTest();

  let firstTestUserId = "";

  it("primeiro teste cria um usuário", async () => {
    const user = await createUser("per-test-first");
    firstTestUserId = user.id;
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("segundo teste NÃO enxerga o usuário criado pelo primeiro", async () => {
    expect(firstTestUserId).not.toBe("");
    expect(
      await db.user.findUnique({ where: { id: firstTestUserId } }),
    ).toBeNull();
  });
});

describe("db.$transaction dentro de transação de teste (savepoint)", () => {
  useRollbackTransactionPerTest();

  it("falha no bloco interno desfaz só as escritas do bloco", async () => {
    const outer = await createUser("sp-outer");
    const innerId = `user_rollback_sp_inner_${Math.random().toString(36).slice(2, 8)}`;

    await expect(
      db.$transaction(async () => {
        await db.user.create({
          data: {
            id: innerId,
            email: uniqueEmail("sp-inner"),
            password: "hashedpassword123",
            credits: 0,
            plan: "STARTER",
          },
        });
        throw new Error("falha no bloco interno");
      }),
    ).rejects.toThrow("falha no bloco interno");

    expect(await db.user.findUnique({ where: { id: innerId } })).toBeNull();
    expect(
      await db.user.findUnique({ where: { id: outer.id } }),
    ).not.toBeNull();
  });

  it("bloco interno com sucesso mantém as escritas até o fim do teste", async () => {
    const innerId = `user_rollback_sp_ok_${Math.random().toString(36).slice(2, 8)}`;

    const result = await db.$transaction(async () => {
      await db.user.create({
        data: {
          id: innerId,
          email: uniqueEmail("sp-ok"),
          password: "hashedpassword123",
          credits: 0,
          plan: "STARTER",
        },
      });
      return "ok";
    });

    expect(result).toBe("ok");
    expect(await db.user.findUnique({ where: { id: innerId } })).not.toBeNull();
  });
});

describe("fixtures criadas em beforeEach ficam dentro da transação do teste", () => {
  useRollbackTransactionPerTest();

  const FIXED_ID = "user_rollback_before_each_fixed";

  beforeEach(async () => {
    await createUserWithId(FIXED_ID);
  });

  it("fixture do beforeEach é visível no teste", async () => {
    expect(await db.user.count({ where: { id: FIXED_ID } })).toBe(1);
  });

  it("fixture do beforeEach não sobrevive ao teste anterior (sem duplicar)", async () => {
    expect(await db.user.count({ where: { id: FIXED_ID } })).toBe(1);
  });
});

async function createUserWithId(id: string) {
  return db.user.create({
    data: {
      id,
      email: uniqueEmail(id),
      password: "hashedpassword123",
      credits: 0,
      plan: "STARTER",
    },
  });
}
