/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("~/inngest/client", () => ({
  inngest: { send: sendMock },
}));

import { InngestQueueGateway } from "~/infrastructure/queue/inngest-queue.gateway";

describe("InngestQueueGateway.sendAddClipsToProjectEvent", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ ids: ["evt"] });
  });

  // Idempotência por lote: o Inngest deduplica eventos com o mesmo `id`
  // (janela de 24h). Sem `id`, um reenvio do mesmo `inngest.send` (retry de
  // rede do SDK/da Server Action) gera um segundo evento -> segunda execução
  // da function -> segundo hold/consumo de créditos e clipes duplicados para
  // o MESMO lote.
  it("envia o evento com um id determinístico derivado do batchId (dedupe do Inngest)", async () => {
    const gateway = new InngestQueueGateway();

    await gateway.sendAddClipsToProjectEvent({
      uploadedFileId: "file-1",
      batchId: "batch-abc",
      userId: "user-1",
      mode: "manual",
      manualCuts: [{ startTime: 10, endTime: 20 }],
      excludedRanges: [],
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0]![0] as { id?: string; name: string };
    expect(sent.name).toBe("append-clips-events");
    expect(sent.id).toBe("append-clips-batch-abc");
  });
});
