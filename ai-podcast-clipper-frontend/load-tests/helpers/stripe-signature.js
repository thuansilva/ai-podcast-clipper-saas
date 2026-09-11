import crypto from "k6/crypto";

/**
 * Gera um header stripe-signature válido com timestamp e HMAC-SHA256
 * @param {string} payload - Corpo da requisição em string JSON
 * @param {string} secret - Segredo do webhook do Stripe (whsec_...)
 * @returns {string} Cabeçalho formatado: t=timestamp,v1=signature
 */
export function generateStripeSignature(payload, secret = "whsec_test_secret") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.hmac("sha256", secret, signedPayload, "hex");
  return `t=${timestamp},v1=${signature}`;
}
