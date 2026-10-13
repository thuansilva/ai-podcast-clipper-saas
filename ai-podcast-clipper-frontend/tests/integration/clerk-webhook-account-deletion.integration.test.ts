/**
 * @vitest-environment node
 *
 * Teste de integração: webhook `user.deleted` do Clerk
 * (`src/app/api/webhooks/clerk/route.ts`), bate na rota real (mesmo padrão
 * de `tests/integration/stripe-webhook-idempotency.integration.test.ts`),
 * só com `svix` mockado (bypassa a verificação de assinatura — mesma
 * técnica de `tests/unit/api/clerk-webhook.test.ts`) e o cliente Inngest
 * mockado (sem bater numa fila/rede real).
 *
 * Desde 2026-10-12, o webhook NÃO executa mais a limpeza da conta
 * diretamente — ele só despacha o evento `clerk/user.deleted` para o
 * Inngest e responde rápido (padrão correto para webhook + fila: confirmar
 * recebimento, não conclusão). A limpeza de verdade (cancelar assinatura,
 * apagar arquivos do S3, anonimizar o cadastro e apagar as linhas do banco)
 * roda na function `deleteUserAccount` (`src/inngest/functions.ts`), com
 * Postgres real — ver
 * `tests/integration/delete-user-account-inngest.integration.test.ts`.
 *
 * Não importa `~/inngest/functions` neste arquivo (só a rota do webhook):
 * mockar `~/inngest/client` aqui não afetaria aquele outro teste de
 * qualquer forma, já que `vi.mock` é isolado por arquivo de teste, mas a
 * separação em dois arquivos deixa a intenção clara — este cobre só o
 * despacho, o outro cobre só a limpeza.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    verify(payload: string) {
      return JSON.parse(payload);
    }
  },
}));

const mockInngestSend = vi.fn();
vi.mock("~/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}));

// Importado DEPOIS dos vi.mock acima (hoisted pelo Vitest para o topo do
// módulo de qualquer forma, mantido aqui embaixo por clareza de leitura).
import { POST } from "~/app/api/webhooks/clerk/route";

describe("Clerk Webhook user.deleted - despacho para o Inngest", () => {
  beforeEach(() => {
    mockInngestSend.mockReset();
    mockInngestSend.mockResolvedValue({ ids: ["evt_test"] });
  });

  function buildDeletedUserRequest(userId: string): Request {
    const payload = JSON.stringify({
      type: "user.deleted",
      data: { id: userId },
    });

    return new Request("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      headers: {
        "svix-id": `msg_${userId}`,
        "svix-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "svix-signature": "v1,signature",
      },
      body: payload,
    });
  }

  it("responde 200 e despacha clerk/user.deleted com o userId certo, sem executar a limpeza", async () => {
    const userId = `user_clerk_dispatch_${Date.now()}`;

    const response = await POST(buildDeletedUserRequest(userId));
    expect(response.status).toBe(200);

    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "clerk/user.deleted",
      data: { userId },
    });
  });

  it("responde 500 (para o Clerk reentregar) se o despacho para o Inngest falhar", async () => {
    mockInngestSend.mockRejectedValueOnce(new Error("Inngest fora do ar"));
    const userId = `user_clerk_dispatch_fail_${Date.now()}`;

    const response = await POST(buildDeletedUserRequest(userId));
    expect(response.status).toBe(500);
  });
});
