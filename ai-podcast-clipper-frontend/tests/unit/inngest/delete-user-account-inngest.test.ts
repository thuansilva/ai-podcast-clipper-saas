import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteUserAccount, type PipelineStep } from "~/inngest/functions";
import { logger } from "~/lib/observability/logger";

const mockCancelExecute = vi.fn();
const mockDeleteFilesExecute = vi.fn();
const mockAnonymizeExecute = vi.fn();

vi.mock("~/infrastructure/factories/use-case-factories", () => ({
  makeCancelUserSubscriptionUseCase: () => ({ execute: mockCancelExecute }),
  makeDeleteUserFilesFromStorageUseCase: () => ({
    execute: mockDeleteFilesExecute,
  }),
  makeAnonymizeUserAndDeleteRowsUseCase: () => ({
    execute: mockAnonymizeExecute,
  }),
}));

vi.mock("~/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Mock de `step` que executa o callback imediatamente e grava o nome de
 * cada passo chamado — mesmo padrão de
 * `tests/unit/inngest/subscription-inngest.test.ts`.
 */
function createMockStep(): PipelineStep {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => await fn()),
  } as unknown as PipelineStep;
}

/**
 * Mock de `step` que memoiza o resultado por nome de passo — simula o
 * comportamento real do Inngest de reaproveitar a memória do run entre a
 * execução original e um retry (mesma técnica de
 * `tests/unit/inngest/subscription-inngest.test.ts` e
 * `tests/integration/inngest-billing-step-idempotency.integration.test.ts`).
 */
function createMemoizingStep(): PipelineStep {
  const cache = new Map<string, unknown>();
  return {
    run: vi.fn(async (name: string, fn: () => unknown) => {
      if (cache.has(name)) {
        return cache.get(name);
      }
      const result = await fn();
      cache.set(name, result);
      return result;
    }),
  } as unknown as PipelineStep;
}

describe("Inngest deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve registrar o trigger clerk/user.deleted com retries: 3", () => {
    const fnId =
      typeof deleteUserAccount.id === "function"
        ? (deleteUserAccount as any).id()
        : deleteUserAccount.id;
    expect(fnId).toBe("delete-user-account");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = (deleteUserAccount as any).opts;
    const eventNames = opts.triggers.map((t: { event: string }) => t.event);
    expect(eventNames).toContain("clerk/user.deleted");
    expect(opts.retries).toBe(3);
  });

  it("deve chamar as 3 sub-etapas na ordem certa, cada uma no seu próprio step.run nomeado", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (deleteUserAccount as any).fn;
    const step = createMockStep();

    await fn({
      event: { data: { userId: "user_delete_123" } },
      step,
    });

    expect(mockCancelExecute).toHaveBeenCalledWith({
      userId: "user_delete_123",
    });
    expect(mockDeleteFilesExecute).toHaveBeenCalledWith({
      userId: "user_delete_123",
    });
    expect(mockAnonymizeExecute).toHaveBeenCalledWith({
      userId: "user_delete_123",
    });

    const stepNames = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0]
    );
    expect(stepNames).toEqual([
      "cancel-subscription",
      "delete-storage-files",
      "anonymize-user-and-delete-rows",
    ]);
  });

  it("simulação de retry (mesmo step memoizado): uma etapa já concluída não roda de novo", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (deleteUserAccount as any).fn;
    const step = createMemoizingStep();

    const eventPayload = {
      event: { data: { userId: "user_delete_retry" } },
      step,
    };

    // 1ª execução: processa as 3 etapas normalmente.
    await fn(eventPayload);
    expect(mockCancelExecute).toHaveBeenCalledTimes(1);
    expect(mockDeleteFilesExecute).toHaveBeenCalledTimes(1);
    expect(mockAnonymizeExecute).toHaveBeenCalledTimes(1);

    // "Retry" do Inngest: a função roda de novo do zero, mas reaproveita o
    // mesmo `step` (memória do run) — nenhuma das 3 etapas, já memoizadas,
    // deve chamar os use cases de novo.
    await fn(eventPayload);
    expect(mockCancelExecute).toHaveBeenCalledTimes(1);
    expect(mockDeleteFilesExecute).toHaveBeenCalledTimes(1);
    expect(mockAnonymizeExecute).toHaveBeenCalledTimes(1);
  });

  it("retry parcial: se delete-storage-files falhar e for retentado, cancel-subscription (já memoizado) não roda de novo", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (deleteUserAccount as any).fn;
    const step = createMemoizingStep();

    mockDeleteFilesExecute.mockRejectedValueOnce(new Error("S3 fora do ar"));

    const eventPayload = {
      event: { data: { userId: "user_delete_partial_retry" } },
      step,
    };

    await expect(fn(eventPayload)).rejects.toThrow("S3 fora do ar");
    expect(mockCancelExecute).toHaveBeenCalledTimes(1);
    expect(mockAnonymizeExecute).not.toHaveBeenCalled();

    // Retry: "cancel-subscription" já está memoizado (sucesso), então não
    // deve ser chamado de novo; "delete-storage-files" é tentado de novo
    // (não memoizado, pois falhou) e, desta vez, sucede.
    await fn(eventPayload);
    expect(mockCancelExecute).toHaveBeenCalledTimes(1);
    expect(mockDeleteFilesExecute).toHaveBeenCalledTimes(2);
    expect(mockAnonymizeExecute).toHaveBeenCalledTimes(1);
  });

  it("onFailure: loga logger.error com userId e o erro quando os retries se esgotam", async () => {
    const onFailureFn = (
      deleteUserAccount as unknown as {
        opts: { onFailure: Function };
      }
    ).opts.onFailure;
    expect(typeof onFailureFn).toBe("function");

    await onFailureFn({
      event: {
        data: {
          event: {
            data: { userId: "user_delete_exhausted" },
          },
        },
      },
      error: new Error("Postgres fora do ar"),
    });

    expect(logger.error).toHaveBeenCalledWith(
      "delete-user-account exhausted all retries",
      expect.objectContaining({
        userId: "user_delete_exhausted",
        error: "Postgres fora do ar",
      })
    );
  });
});
