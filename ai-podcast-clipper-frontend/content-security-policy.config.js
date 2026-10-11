/**
 * Content-Security-Policy — construída aqui, separada de `next.config.js`,
 * só para poder ser testada isoladamente (ver `tests/unit/next-config.test.ts`)
 * sem precisar importar o módulo de config inteiro do Next.
 *
 * IMPORTANTÍSSIMO: até hoje isto só é usado para montar o valor do header
 * `Content-Security-Policy-Report-Only` (ver `next.config.js`), nunca
 * `Content-Security-Policy` em modo enforce. Report-Only só *reporta*
 * violações (no DevTools do browser; não há endpoint de `report-to`
 * configurado ainda) sem bloquear nenhum carregamento — é deliberadamente
 * "inofensivo" até alguém validar ao vivo (login Clerk, checkout/portal
 * Stripe, player de vídeo) em staging e decidir promover para enforce. Ver
 * `docs/operacao/checklist-go-live.md` (RNF-SEC-09) para o critério de
 * promoção e quem decide.
 *
 * Domínios externos abaixo foram levantados lendo o código (não supostos):
 * - Clerk (`src/app/layout.tsx::ClerkProvider`, `src/middleware.ts`,
 *   `src/components/auth/custom-sign-in-form.tsx`/`custom-sign-up-form.tsx`
 *   via `useSignIn`/`useSignUp` do `@clerk/nextjs/legacy`): o SDK headless
 *   ainda carrega o script `clerk-js` e pode abrir handshake/iframe do
 *   Frontend API. Hoje o projeto só usa chave de desenvolvimento (ver
 *   checklist-go-live.md, "Chave Clerk de produção não configurada"), cujo
 *   Frontend API é sempre um subdomínio de `clerk.accounts.dev`. Avatares de
 *   usuário (`user.imageUrl` em `nav-user.tsx`/`user-nav-menu.tsx`) vêm de
 *   `img.clerk.com`.
 * - Stripe: `src/actions/stripe.ts` + `src/infrastructure/payments/
 *   stripe-payment.gateway.ts` usam `stripe.checkout.sessions.create` /
 *   `stripe.billingPortal.sessions.create` e fazem `redirect(sessionUrl)`
 *   (navegação de página inteira para `checkout.stripe.com`/portal do
 *   Stripe) — não há `@stripe/stripe-js`/Stripe Elements embutido em
 *   nenhuma página (`loadStripe`/`<Elements>` não aparecem em `src/`). Uma
 *   navegação de página inteira não é regida pela CSP da página de origem,
 *   então **nenhum domínio Stripe precisa entrar nesta política hoje**. Se
 *   o app passar a usar Stripe.js/Elements embutido, revisar isto.
 * - S3/MinIO: `src/infrastructure/storage/s3-storage.gateway.ts` gera URLs
 *   pré-assinadas (`createPlayPresignedUrl`) consumidas via `<video src>`
 *   em `custom-video-player.tsx` (usado por `clip-card.tsx` e
 *   `clip-details-modal.tsx`). Em AWS real (sem `S3_ENDPOINT_URL`), o SDK
 *   usa endereçamento virtual-hosted-style (`<bucket>.s3.<region>.
 *   amazonaws.com`); em MinIO/dev (`S3_ENDPOINT_URL` configurado), o host é
 *   arbitrário e só conhecido em runtime — por isso é injetado via
 *   `resolveExtraMediaOrigins`/`resolveExtraImgOrigins` abaixo, não
 *   hardcoded.
 * - Miniaturas do YouTube: `src/app/api/youtube/info/route.ts` retorna
 *   `thumbnailUrl` da API `youtubei`/oEmbed do YouTube, renderizada via
 *   `<img src={metadata.thumbnailUrl}>` em
 *   `src/components/dashboard/create-project-client.tsx:292` — domínio
 *   observado: `i.ytimg.com` (e variantes numeradas `iN.ytimg.com`).
 * - Imagens da landing: `src/components/landing/showcase-carousel.tsx` usa
 *   `<img src={showcase.bgImage}>` com URLs hardcoded de
 *   `images.unsplash.com`.
 * - OpenTelemetry (`src/instrumentation.ts`): `registerOTel`/exporters OTLP
 *   só rodam no runtime Node do servidor (`if (process.env.NEXT_RUNTIME !==
 *   "nodejs") return`) — nenhuma chamada sai do browser, então não entra
 *   nesta CSP (que só governa o que o *browser* carrega).
 */

const CLERK_FRONTEND_API = "https://*.clerk.accounts.dev";
const CLERK_IMAGES = "https://img.clerk.com";
const YOUTUBE_THUMBNAILS = ["https://i.ytimg.com", "https://*.ytimg.com"];
const UNSPLASH_IMAGES = "https://images.unsplash.com";
const AWS_S3 = "https://*.amazonaws.com";

/**
 * @param {string | undefined} endpointUrl valor de `S3_ENDPOINT_URL` (MinIO
 *   ou outro S3-compatível). `undefined`/inválido não adiciona nada — AWS S3
 *   real já está coberto por `AWS_S3` acima.
 * @returns {string[]} origem (protocolo+host[:porta]) a adicionar, ou `[]`.
 */
function resolveExtraOriginFromS3Endpoint(endpointUrl) {
  if (!endpointUrl) {
    return [];
  }
  try {
    const { protocol, host } = new URL(endpointUrl);
    return [`${protocol}//${host}`];
  } catch {
    return [];
  }
}

/**
 * @param {{ extraMediaSrc?: string[]; extraImgSrc?: string[] }} [options]
 * @returns {string} o valor completo do header CSP (diretivas separadas por
 *   `; `), pronto para ser usado como valor de
 *   `Content-Security-Policy-Report-Only`.
 */
export function buildContentSecurityPolicy(options = {}) {
  const extraMediaSrc = options.extraMediaSrc ?? [];
  const extraImgSrc = options.extraImgSrc ?? [];

  /** @type {[string, string[]][]} */
  const directives = [
    // Defesa mínima: nada carrega de fora da própria origem por padrão.
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'self'"]],
    ["form-action", ["'self'"]],
    // 'unsafe-inline' é necessário hoje por dois motivos observados no
    // código: o script inline de tema em `src/app/layout.tsx` (sem nonce) e
    // o `clerk-js` headless, que injeta scripts/estilos inline próprios.
    // Fica como gap conhecido para quando este header virar enforce (ver
    // nota no topo do arquivo) — nessa migração, considerar nonce via
    // middleware em vez de 'unsafe-inline'.
    ["script-src", ["'self'", "'unsafe-inline'", CLERK_FRONTEND_API]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    [
      "img-src",
      [
        "'self'",
        "data:",
        CLERK_IMAGES,
        ...YOUTUBE_THUMBNAILS,
        UNSPLASH_IMAGES,
        AWS_S3,
        ...extraImgSrc,
      ],
    ],
    ["media-src", ["'self'", AWS_S3, ...extraMediaSrc]],
    ["connect-src", ["'self'", CLERK_FRONTEND_API, "https://api.clerk.com"]],
    ["frame-src", ["'self'", CLERK_FRONTEND_API]],
    ["worker-src", ["'self'", "blob:"]],
  ];

  return directives
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export { resolveExtraOriginFromS3Endpoint };
