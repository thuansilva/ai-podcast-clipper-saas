# Plano de Implementação: Suíte de Testes de Carga com Grafana k6

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar uma suíte modular de testes de carga e estresse utilizando Grafana k6 no frontend (`ai-podcast-clipper-frontend`), cobrindo endpoints de API, Webhooks do Stripe, geração de URLs S3 e simulação de concorrência com validação estrita de SLAs/Thresholds.

**Architecture:** A suíte é organizada em `load-tests/` com módulos reutilizáveis de configuração (SLAs e perfis de VUs), helpers criptográficos para assinaturas do Stripe, cenários individuais de teste e uma suíte unificada com distribuição ponderada de tráfego.

**Tech Stack:** Grafana k6 (JavaScript ES6, `k6/http`, `k6/crypto`), Next.js 15, Prisma ORM, Stripe Webhook.

**Spec:** `docs/superpowers/specs/2026-09-11-load-testing-k6-spec.md`

## Global Constraints
- Scripts de teste devem ser compatíveis com a runtime do k6 (ES6 modules, imports `k6/http`, `k6/crypto`, `k6`).
- Nenhuma dependência externa pesada do Node.js incompatível com k6.
- A suite deve aceitar a variável de ambiente `BASE_URL` (padrão: `http://localhost:3000`).
- NUNCA executar `git commit` ou `git push` sem autorização explícita do usuário (conforme `AGENTS.md`).

---

### Task 1: Criar Configurações de SLAs e Perfis de Carga

**Files:**
- Create: `ai-podcast-clipper-frontend/load-tests/config/thresholds.js`
- Create: `ai-podcast-clipper-frontend/load-tests/config/profiles.js`

**Interfaces:**
- Produces: `export const thresholds` (regras de p90, p95, p99 e taxa de erro)
- Produces: `export function getProfileOptions(profileName)` (retorna configuração de estágios/VUs para `smoke`, `load` ou `stress`)

- [ ] **Step 1: Criar `load-tests/config/thresholds.js`**

```javascript
export const standardThresholds = {
  http_req_failed: ["rate<0.01"], // menos de 1% de erros HTTP
  http_req_duration: [
    "p(90)<150", // 90% das requisições abaixo de 150ms
    "p(95)<250", // 95% das requisições abaixo de 250ms
    "p(99)<500", // 99% das requisições abaixo de 500ms
  ],
};
```

- [ ] **Step 2: Criar `load-tests/config/profiles.js`**

```javascript
export function getProfileOptions(profile = "smoke") {
  switch (profile) {
    case "stress":
    case "spike":
      return {
        stages: [
          { duration: "15s", target: 50 },
          { duration: "1m", target: 150 },
          { duration: "15s", target: 200 },
          { duration: "30s", target: 0 },
        ],
      };
    case "load":
      return {
        stages: [
          { duration: "30s", target: 10 },
          { duration: "1m", target: 30 },
          { duration: "30s", target: 0 },
        ],
      };
    case "smoke":
    default:
      return {
        vus: 5,
        duration: "30s",
      };
  }
}
```

---

### Task 2: Implementar Helpers de Assinatura Stripe e Fixtures

**Files:**
- Create: `ai-podcast-clipper-frontend/load-tests/helpers/stripe-signature.js`
- Create: `ai-podcast-clipper-frontend/load-tests/helpers/fixtures.js`
- Create: `ai-podcast-clipper-frontend/load-tests/helpers/auth-headers.js`

**Interfaces:**
- Consumes: `k6/crypto`
- Produces: `export function generateStripeSignature(payload, secret)`
- Produces: `export function generateCheckoutSessionPayload(options)`
- Produces: `export function getCommonHeaders(customHeaders)`

- [ ] **Step 1: Criar `load-tests/helpers/stripe-signature.js`**

```javascript
import crypto from "k6/crypto";

export function generateStripeSignature(payload, secret = "whsec_test_secret") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.hmac("sha256", secret, signedPayload, "hex");
  return `t=${timestamp},v1=${signature}`;
}
```

- [ ] **Step 2: Criar `load-tests/helpers/fixtures.js`**

```javascript
export function generateCheckoutSessionPayload({
  customerId = "cus_test_load_user",
  priceId = "price_small_pack",
} = {}) {
  const eventId = `evt_load_${Math.random().toString(36).substring(2, 10)}`;
  const sessionId = `cs_test_${Math.random().toString(36).substring(2, 10)}`;

  const event = {
    id: eventId,
    object: "event",
    api_version: "2025-04-30.basil",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: customerId,
        payment_status: "paid",
        status: "complete",
        line_items: {
          object: "list",
          data: [
            {
              id: `li_${Math.random().toString(36).substring(2, 8)}`,
              price: {
                id: priceId,
              },
              quantity: 1,
            },
          ],
        },
      },
    },
  };

  return JSON.stringify(event);
}
```

- [ ] **Step 3: Criar `load-tests/helpers/auth-headers.js`**

```javascript
export function getCommonHeaders(customHeaders = {}) {
  return Object.assign(
    {
      "Content-Type": "application/json",
      "User-Agent": "k6-load-testing-agent/1.0",
    },
    customHeaders
  );
}
```

---

### Task 3: Implementar Cenários de Carga e Suíte Unificada

**Files:**
- Create: `ai-podcast-clipper-frontend/load-tests/scenarios/stripe-webhook.js`
- Create: `ai-podcast-clipper-frontend/load-tests/scenarios/s3-presign-flow.js`
- Create: `ai-podcast-clipper-frontend/load-tests/scenarios/main-suite.js`

**Interfaces:**
- Consumes: `load-tests/config/profiles.js`, `load-tests/config/thresholds.js`, `load-tests/helpers/*`
- Produces: Cenários executáveis via CLI do k6 (`k6 run <script>`)

- [ ] **Step 1: Criar `load-tests/scenarios/stripe-webhook.js`**

```javascript
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
  const payload = generateCheckoutSessionPayload({
    customerId: `cus_load_${__VU}`,
    priceId: "price_small_pack",
  });

  const signature = generateStripeSignature(payload, webhookSecret);
  const headers = getCommonHeaders({
    "stripe-signature": signature,
  });

  const res = http.post(`${baseUrl}/api/webhooks/stripe`, payload, { headers });

  check(res, {
    "status is 200 or 400 (signature/customer handling)": (r) =>
      r.status === 200 || r.status === 400,
    "response time < 300ms": (r) => r.timings.duration < 300,
  });

  sleep(0.1);
}
```

- [ ] **Step 2: Criar `load-tests/scenarios/s3-presign-flow.js`**

```javascript
import http from "k6/http";
import { check, sleep } from "k6";
import { standardThresholds } from "../config/thresholds.js";
import { getProfileOptions } from "../config/profiles.js";
import { getCommonHeaders } from "../helpers/auth-headers.js";

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://localhost:3000";

export const options = Object.assign({}, getProfileOptions(profile), {
  thresholds: standardThresholds,
});

export default function () {
  const payload = JSON.stringify({
    filename: `test_podcast_${__VU}_${__ITER}.mp4`,
    contentType: "video/mp4",
  });

  const res = http.post(`${baseUrl}/api/upload-url`, payload, {
    headers: getCommonHeaders(),
  });

  check(res, {
    "endpoint reachable (status is 200 or 401 unauth)": (r) =>
      r.status === 200 || r.status === 401,
    "response time < 250ms": (r) => r.timings.duration < 250,
  });

  sleep(0.1);
}
```

- [ ] **Step 3: Criar `load-tests/scenarios/main-suite.js`**

```javascript
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
    // 70% Tráfego de APIs e endpoints
    const res = http.get(`${baseUrl}/api/health`, {
      headers: getCommonHeaders(),
    });

    check(res, {
      "GET status is valid": (r) => r.status === 200 || r.status === 404,
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
      "Webhook status is valid": (r) => r.status === 200 || r.status === 400,
    });
  }

  sleep(0.2);
}
```

---

### Task 4: Adicionar Scripts no `package.json` e Documentação

**Files:**
- Modify: `ai-podcast-clipper-frontend/package.json`
- Create: `ai-podcast-clipper-frontend/load-tests/README.md`

- [ ] **Step 1: Atualizar scripts no `package.json`**

Adicionar em `scripts`:
```json
"test:load:smoke": "k6 run --env PROFILE=smoke load-tests/scenarios/main-suite.js",
"test:load": "k6 run --env PROFILE=load load-tests/scenarios/main-suite.js",
"test:load:stress": "k6 run --env PROFILE=stress load-tests/scenarios/main-suite.js",
"test:load:stripe": "k6 run load-tests/scenarios/stripe-webhook.js"
```

- [ ] **Step 2: Criar `load-tests/README.md` com instruções completas de instalação e execução**

---

### Task 5: Validação e Execução de Teste de Sanidade

- [ ] **Step 1: Verificar integridade dos scripts com syntax check / linter**
- [ ] **Step 2: Executar validação dos arquivos de configuração e helpers**
