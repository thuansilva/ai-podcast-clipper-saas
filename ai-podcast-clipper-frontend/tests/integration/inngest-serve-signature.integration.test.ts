/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * RNF-SEC-04 (regression guard): `/api/inngest` (route handler real gerado
 * pelo `serve()` do SDK `inngest` v4, ver `src/app/api/inngest/route.ts`)
 * NÃO pode executar funções a partir de uma requisição sem assinatura
 * válida do Inngest quando o app roda como produção.
 *
 * Comportamento do SDK (v4.20, `InngestCommHandler.validateSignature`): em
 * "cloud mode" (default quando `INNGEST_DEV` não está setado), requisição
 * sem `X-Inngest-Signature` válida → 401; e a FALTA de
 * `INNGEST_SIGNING_KEY` vira 500 sem executar nada (fail closed). O SDK já
 * rejeita por padrão — este teste é guarda de regressão (ex.: alguém
 * passar `isDev: true`/`INNGEST_DEV=1` no client ou trocar o `serve`). A
 * correção de fato do item HIGH é a validação central em `src/env.js`
 * (`assertInngestProductionEnv`), que impede o deploy de subir sem a
 * signing key ou com `INNGEST_DEV` em produção — ver
 * tests/unit/config/inngest-env-validation.test.ts.
 *
 * Os cenários usam o route handler real (mesmo objeto que o Next serve em
 * `/api/inngest`) com `Request`s HTTP reais, e as mesmas URLs/headers que
 * um teste e2e contra um servidor de pé usaria.
 */

const BASE = "http://localhost:3000/api/inngest";
const FN_URL = `${BASE}?fnId=ai-podcast-clipper-frontend-process-video&stepId=step`;

const executionBody = JSON.stringify({
  event: { name: "process-video-events", data: { uploadedFileId: "x" } },
  events: [],
  steps: {},
  ctx: { run_id: "run_forjado", attempt: 0, stack: { stack: [], current: 0 } },
  use_api: false,
});

async function loadRoute() {
  vi.resetModules();
  return import("~/app/api/inngest/route");
}

function postExecution(headers: Record<string, string> = {}) {
  return new NextRequest(FN_URL, {
    method: "POST",
    body: executionBody,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("/api/inngest - verificação de assinatura em produção (Integration)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    // "" (e não `undefined`) de propósito: o import do `@prisma/client`
    // (puxado pela route via `~/inngest/functions` → `~/server/db`) carrega
    // o `.env` local via dotenv, que só preenche variáveis AUSENTES de
    // `process.env`. Com `undefined` (= delete), um `.env` de dev com
    // `INNGEST_DEV=1` reapareceria no meio do teste e colocaria o SDK em
    // dev mode (sem verificação de assinatura) — exatamente o footgun que
    // a validação central de `src/env.js` bloqueia em produção.
    vi.stubEnv("INNGEST_DEV", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POST sem assinatura e com INNGEST_SIGNING_KEY ausente → 500 sem executar a função (fail closed)", async () => {
    // Cloud mode sem signing key: `checkModeConfiguration()` do SDK falha e
    // o handler responde `internalServerErrorResponse` (500) ANTES de
    // qualquer execução — nunca 2xx/206 (execução de step).
    vi.stubEnv("INNGEST_SIGNING_KEY", "");
    const { POST } = await loadRoute();

    const res = await POST(postExecution(), undefined as never);

    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/was not found|step/i);
  });

  it("POST sem header X-Inngest-Signature com signing key configurada → 401", async () => {
    vi.stubEnv(
      "INNGEST_SIGNING_KEY",
      "signkey-prod-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    const { POST } = await loadRoute();

    const res = await POST(postExecution(), undefined as never);

    expect(res.status).toBe(401);
  });

  it("POST com assinatura forjada → 401", async () => {
    vi.stubEnv(
      "INNGEST_SIGNING_KEY",
      "signkey-prod-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    const { POST } = await loadRoute();
    const ts = Math.round(Date.now() / 1000);

    const res = await POST(
      postExecution({
        "x-inngest-signature": `t=${ts}&s=${"0".repeat(64)}`,
      }),
      undefined as never
    );

    expect(res.status).toBe(401);
  });

  it("controle: com INNGEST_DEV=1 (dev mode) o SDK NÃO aplica a checagem de assinatura", async () => {
    // Mostra que os 401 acima vêm de fato da verificação de assinatura (e
    // por que `INNGEST_DEV` é proibido em produção pela validação central).
    vi.stubEnv("INNGEST_DEV", "1");
    vi.stubEnv("INNGEST_SIGNING_KEY", "");
    const { POST } = await loadRoute();

    // fnId inexistente: em dev mode a requisição passa pela checagem de
    // assinatura e só falha depois, no lookup da função (sem tocar no
    // banco). Em cloud mode ela nem chegaria nesse ponto.
    const res = await POST(
      new NextRequest(`${BASE}?fnId=fn-inexistente&stepId=step`, {
        method: "POST",
        body: executionBody,
        headers: { "content-type": "application/json" },
      }),
      undefined as never
    );

    expect(res.status).not.toBe(401);
    expect(await res.text()).toMatch(/was not found/);
  });
});
