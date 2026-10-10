/**
 * @vitest-environment node
 *
 * Auditoria de segurança (Fase 3): cortes manuais enviados com `mode`
 * omitido/"auto" não podem ser cobrados pelo preço automático e processados
 * em modo manual (ver tests/unit/inngest/manual-cuts-billing-consistency.test.ts
 * para o racional). Aqui o fluxo roda contra o Postgres real (rollback por
 * teste): saldo e `reservedCredits` do usuário não podem mudar, nenhum
 * `CreditTransaction` é criado e o GPU nunca é chamado.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "~/server/db";

import { fetch as undiciFetch } from "undici";
vi.mock("undici", () => ({ Agent: vi.fn(), fetch: vi.fn() }));

import { processVideoHandler, type PipelineStep } from "~/inngest/functions";
import type { ManualCutDTO } from "~/application/dtos/video-dtos";
import { useRollbackTransactionPerTest } from "../helpers/with-rollback-transaction";

describe("Inngest — coerência cobrança × modo manual (integração)", () => {
  useRollbackTransactionPerTest();

  const createStep = (): PipelineStep => ({
    run: vi.fn(async (_name: string, fn: () => any) => await fn()),
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const FIFTY_CUTS: ManualCutDTO[] = Array.from({ length: 50 }, (_, i) => ({
    title: `Corte ${i + 1}`,
    startTime: 0,
    endTime: 60,
  }));

  it.each([
    ["omitido", undefined],
    ["'auto'", "auto" as const],
  ])(
    "cortes manuais com mode %s: nenhuma reserva de crédito, GPU não chamado, arquivo marcado como failed",
    async (_label, mode) => {
      const user = await db.user.create({
        data: {
          id: `user_billing_mismatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          email: `billing-mismatch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
          password: "hashedpassword123",
          credits: 100,
          reservedCredits: 0,
        },
      });
      const file = await db.uploadedFile.create({
        data: {
          userId: user.id,
          s3Key: `uploads/billing-mismatch-${Date.now()}/original.mp4`,
          displayName: "podcast-1min.mp4",
          status: "queued",
          durationSeconds: 60,
          sourceType: "UPLOAD",
        },
      });

      const result = await processVideoHandler({
        event: {
          data: {
            uploadedFileId: file.id,
            userId: user.id,
            preset: "HORMOZI",
            mode,
            manualCuts: FIFTY_CUTS,
          },
        },
        step: createStep(),
      });

      expect(result.success).toBe(false);
      expect(undiciFetch).not.toHaveBeenCalled();

      const userAfter = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(userAfter.credits).toBe(100);
      expect(userAfter.reservedCredits).toBe(0);

      const transactions = await db.creditTransaction.count({
        where: { userId: user.id },
      });
      expect(transactions).toBe(0);

      const fileAfter = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
      expect(fileAfter.status).toBe("failed");
    },
  );
});
