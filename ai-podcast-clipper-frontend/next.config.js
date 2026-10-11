/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import {
  buildContentSecurityPolicy,
  resolveExtraOriginFromS3Endpoint,
} from "./content-security-policy.config.js";

const securityHeaders = [
  // Impede que o browser tente "adivinhar" o mimetype de uma resposta.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Só permite embutir o site num <iframe> da própria origem (mitiga clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Não vaza a URL completa de origem em navegação cross-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga acesso a APIs de hardware que este app não usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Força HTTPS em navegações futuras (efeito só em produção, atrás de HTTPS real).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * NOTA: Content-Security-Policy em modo ENFORCE foi deliberadamente deixado
 * de fora aqui. Uma CSP mal calibrada pode quebrar o Clerk (auth) e o
 * Stripe (checkout), que carregam scripts/iframes de domínios próprios —
 * isso exige testar ao vivo o fluxo de login e de pagamento antes de
 * habilitar, não só ler o código. Ver docs/operacao/checklist-go-live.md
 * (RNF-SEC-09) para o gap em aberto.
 *
 * O que EXISTE hoje é só `Content-Security-Policy-Report-Only` abaixo
 * (header separado, fora de `securityHeaders`): ele reporta violações no
 * DevTools do browser sem bloquear nenhum carregamento — zero risco de
 * quebrar login/checkout/player em produção. A política em si vive em
 * `./content-security-policy.config.js` (testada isoladamente em
 * `tests/unit/next-config.test.ts`), incluindo o levantamento, lendo o
 * código, de quais domínios externos o app realmente carrega (Clerk,
 * miniaturas do YouTube, imagens da landing, S3/MinIO).
 *
 * NUNCA troque o header abaixo para `Content-Security-Policy` (enforce)
 * sem antes validar manualmente, em staging, com a chave Clerk real: (1)
 * login/signup (`custom-sign-in-form.tsx`/`custom-sign-up-form.tsx`,
 * incluindo o fluxo Google OAuth), (2) checkout e portal do Stripe
 * (`createCheckoutSession`/`createCustomerPortalSession` em
 * `src/actions/stripe.ts`) e (3) reprodução de clipe (`custom-video-
 * player.tsx` com URL pré-assinada do S3). Essa validação ao vivo — e a
 * decisão de promover para enforce — é do usuário, não deste commit.
 */
const contentSecurityPolicyReportOnly = buildContentSecurityPolicy({
  extraMediaSrc: resolveExtraOriginFromS3Endpoint(process.env.S3_ENDPOINT_URL),
  extraImgSrc: resolveExtraOriginFromS3Endpoint(process.env.S3_ENDPOINT_URL),
});

securityHeaders.push({
  key: "Content-Security-Policy-Report-Only",
  value: contentSecurityPolicyReportOnly,
});

/** @type {import("next").NextConfig} */
const config = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
