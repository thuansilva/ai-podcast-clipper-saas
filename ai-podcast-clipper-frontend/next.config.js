/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

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
 * NOTA: Content-Security-Policy foi deliberadamente deixado de fora aqui.
 * Uma CSP mal calibrada pode quebrar o Clerk (auth) e o Stripe (checkout),
 * que carregam scripts/iframes de domínios próprios — isso exige testar ao
 * vivo o fluxo de login e de pagamento antes de habilitar, não só ler o
 * código. Ver docs/operacao/checklist-go-live.md (V9) para o gap em aberto.
 */

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
