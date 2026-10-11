#!/usr/bin/env node
/**
 * Assina LOCALMENTE (offline, sem nenhuma chamada de rede e sem bater em
 * nenhuma rota HTTP do app) um payload de teste de webhook do Stripe, usando a
 * função oficial `stripe.webhooks.generateTestHeaderString`.
 *
 * Substitui o antigo endpoint de debug `/api/dev-sign-stripe-payload`,
 * removido por RNF-SEC-10 (ele expunha um "oráculo de assinatura" com o
 * STRIPE_WEBHOOK_SECRET real em qualquer ambiente com NODE_ENV != production,
 * permitindo forjar webhooks Stripe válidos em preview/staging).
 *
 * Uso (de dentro de ai-podcast-clipper-frontend/):
 *   node scripts/sign-stripe-test-payload.js "$BODY"
 *   echo "$BODY" | node scripts/sign-stripe-test-payload.js
 *
 * Saída (stdout, mesmo formato do antigo endpoint, para não mudar os roteiros):
 *   {"header":"t=<ts>,v1=<hmac>","stripeSecretKeyMode":"test"}
 *
 * Os segredos vêm de process.env ou, na falta, dos mesmos arquivos .env que o
 * `next dev` carrega (mesma precedência). Nenhum segredo é impresso.
 *
 * Uso exclusivo em ambiente local de desenvolvimento/experimentos.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Stripe from "stripe";

/**
 * @param {{ payload: string, webhookSecret: string | undefined, stripeSecretKey: string | undefined, timestamp?: number }} input
 * @returns {{ header: string, stripeSecretKeyMode: "test" | "NOT_TEST_MODE_CHECK_MANUALLY" }}
 */
export function signStripeTestPayload({ payload, webhookSecret, stripeSecretKey, timestamp }) {
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET ausente: defina-o no ambiente ou no .env do frontend antes de assinar o payload.",
    );
  }

  // A chave de API não é usada para assinar (a assinatura é só HMAC local com
  // o webhook secret); um placeholder evita instanciar o SDK com a chave real.
  const stripe = new Stripe("sk_test_offline_signing_only");
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    timestamp: timestamp ?? Math.floor(Date.now() / 1000),
  });

  return {
    header,
    stripeSecretKeyMode: stripeSecretKey?.startsWith("sk_test_")
      ? "test"
      : "NOT_TEST_MODE_CHECK_MANUALLY",
  };
}

/**
 * Carrega os .env do frontend na mesma precedência do `next dev`
 * (o primeiro que definir a variável vence; process.env real vence todos).
 * @param {string} rootDir
 */
function loadFrontendEnv(rootDir) {
  for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    const fullPath = resolve(rootDir, file);
    if (existsSync(fullPath) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(fullPath);
    }
  }
}

function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  loadFrontendEnv(rootDir);

  const payload = process.argv[2] ?? readFileSync(0, "utf8").trim();
  if (!payload) {
    process.stderr.write("Uso: node scripts/sign-stripe-test-payload.js '<payload JSON>'\n");
    process.exit(1);
  }

  const result = signStripeTestPayload({
    payload,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
