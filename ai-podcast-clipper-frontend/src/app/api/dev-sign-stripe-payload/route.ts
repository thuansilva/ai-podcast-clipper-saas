import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "~/env";

/**
 * Endpoint de debug TEMPORÁRIO, criado só para apoiar o experimento de
 * observabilidade (scripts/experimento-observabilidade.sh, cenário
 * "falha_webhook_stripe"): assina um payload de teste com o
 * STRIPE_WEBHOOK_SECRET real do ambiente local, usando o mesmo esquema que o
 * Stripe CLI/SDK usa (`t=<timestamp>,v1=<hmac_sha256_hex>`), sem nunca expor
 * o segredo em si na resposta — só o header `Stripe-Signature` resultante.
 *
 * Motivação: o Stripe CLI não está instalado/autenticado neste ambiente (ver
 * docs do experimento), então não é possível usar `stripe trigger`. Como
 * alternativa, batemos direto na rota do webhook com um evento de teste
 * construído à mão, assinado localmente — sem nenhuma chamada de rede à API
 * real do Stripe.
 *
 * Nunca habilitado em produção. Remover (ou manter desabilitado) depois que
 * o experimento não precisar mais dele.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const body = await req.text();
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const signature = crypto
    .createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  return NextResponse.json({
    header: `t=${timestamp},v1=${signature}`,
    stripeSecretKeyMode: env.STRIPE_SECRET_KEY.startsWith("sk_test_")
      ? "test"
      : "NOT_TEST_MODE_CHECK_MANUALLY",
  });
}
