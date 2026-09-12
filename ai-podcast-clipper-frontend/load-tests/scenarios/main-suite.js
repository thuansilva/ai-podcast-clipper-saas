import http from "k6/http";
import { check, sleep } from "k6";
import { standardThresholds } from "../config/thresholds.js";
import { getProfileOptions } from "../config/profiles.js";
import { generateStripeSignature } from "../helpers/stripe-signature.js";
import { generateCheckoutSessionPayload } from "../helpers/fixtures.js";
import { getCommonHeaders } from "../helpers/auth-headers.js";

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const webhookSecret = __ENV.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";

export const options = Object.assign({}, getProfileOptions(profile), {
  thresholds: standardThresholds,
});

export default function () {
  const rand = Math.random();

  if (rand < 0.7) {
    // 70% Tráfego de APIs e endpoints de consulta
    const res = http.get(`${baseUrl}/api/auth/csrf`, {
      headers: getCommonHeaders(),
    });

    check(res, {
      "GET status is valid (200/404)": (r) => r.status === 200 || r.status === 404,
      "response time < 250ms": (r) => r.timings.duration < 250,
    });
  } else {
    // 30% Webhooks de créditos
    const payload = generateCheckoutSessionPayload({
      customerId: `cus_main_${__VU}`,
      priceId: "price_medium_pack",
    });
    const signature = generateStripeSignature(payload, webhookSecret);
    const headers = getCommonHeaders({ "stripe-signature": signature });

    const res = http.post(`${baseUrl}/api/webhooks/stripe`, payload, { headers });

    check(res, {
      "Webhook status is valid (200/400/404)": (r) =>
        r.status === 200 || r.status === 400 || r.status === 404,
      "response time < 300ms": (r) => r.timings.duration < 300,
    });
  }

  sleep(0.2);
}
