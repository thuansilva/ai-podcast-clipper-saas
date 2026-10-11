/**
 * Validação central (RNF-SEC-04) das env vars do Inngest em produção.
 *
 * - `INNGEST_SIGNING_KEY`: usada pelo `serve()` (`/api/inngest`) para
 *   verificar que cada requisição veio de fato do Inngest.
 * - `INNGEST_EVENT_KEY`: usada pelo `inngest.send` (ex.: dispatch dos
 *   eventos do webhook do Stripe em `stripe-queue.ts`). Sem ela, o
 *   `StripeBackgroundQueue` cairia na fila em memória, que não sobrevive a
 *   cold start serverless.
 * - `INNGEST_DEV`: qualquer valor "verdadeiro" (ex.: `1`, `true` ou uma URL
 *   de dev server) coloca o SDK em dev mode, que DESLIGA a verificação de
 *   assinatura — proibido em produção. `0`/`false`/vazio (forçar cloud
 *   mode) é aceito.
 *
 * Opcionais em development/test (dev local sem Inngest Cloud), obrigatórias
 * em `NODE_ENV=production`. Chamada por `src/env.js` logo após o
 * `createEnv` (portanto falha no `next build` e no boot do servidor, junto
 * com o resto da validação de env, e respeita o mesmo
 * `SKIP_ENV_VALIDATION`).
 *
 * Arquivo `.js` (não `.ts`) porque é importado por `src/env.js`, que por sua
 * vez é importado pelo `next.config.js` antes da compilação TypeScript.
 *
 * @param {{
 *   NODE_ENV?: string | undefined;
 *   INNGEST_EVENT_KEY?: string | undefined;
 *   INNGEST_SIGNING_KEY?: string | undefined;
 *   INNGEST_DEV?: string | undefined;
 * }} vars
 * @returns {void}
 * @throws {Error} se `NODE_ENV === "production"` e a configuração do
 * Inngest for insegura/incompleta.
 */
export function assertInngestProductionEnv(vars) {
  if (vars.NODE_ENV !== "production") return;

  const problems = [];

  for (const name of /** @type {const} */ ([
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
  ])) {
    const value = vars[name];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${name} ausente ou vazia`);
    }
  }

  const devFlag = (vars.INNGEST_DEV ?? "").trim().toLowerCase();
  if (devFlag !== "" && devFlag !== "0" && devFlag !== "false") {
    problems.push(
      `INNGEST_DEV="${vars.INNGEST_DEV}" coloca o SDK do Inngest em dev mode (sem verificação de assinatura em /api/inngest)`
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuração do Inngest inválida para NODE_ENV=production: ${problems.join("; ")}. ` +
        "Configure INNGEST_EVENT_KEY e INNGEST_SIGNING_KEY (Inngest Cloud) e remova INNGEST_DEV do ambiente de produção."
    );
  }
}
