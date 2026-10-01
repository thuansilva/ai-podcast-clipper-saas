# Checklist de Conformidade — OWASP ASVS Nível 2

Levantamento do estado atual de segurança do **AI Podcast Clipper** frente aos
controles do [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
nível 2, relevantes para este projeto (Next.js 15 + Clean Architecture no
frontend, Clerk, Stripe, Prisma/Postgres, Inngest, S3; FastAPI/Modal no
backend de processamento de vídeo).

> Este documento é um **registro de estado**, não uma tarefa concluída. Itens
> marcados ❌/⚠️ são gaps reais que ainda precisam de decisão/priorização —
> nada aqui foi implementado só por estar listado.

Legenda: ✅ Coberto · ⚠️ Parcial/Frágil · ❌ Faltando

---

## V2 — Autenticação

| Controle | Status | Evidência |
|---|---|---|
| Autenticação delegada a provedor consolidado (Clerk) | ✅ | `src/infrastructure/auth/clerk-auth.gateway.ts` — usa `auth()`/`currentUser()` do `@clerk/nextjs/server` |
| Verificação de sessão no servidor (não só client-side) | ✅ | Todas as server actions chamam `makeAuthGateway().getUserId()` antes de agir |
| Middleware protege rotas sensíveis | ⚠️ | `src/middleware.ts` só chama `auth.protect()` para `/dashboard(.*)`. Rotas `/api/**` **não** são protegidas pelo middleware — a autorização depende inteiramente de cada route handler/action verificar sessão individualmente |
| Backend (Modal) autentica chamadas server-to-server | ✅ | `main.py` usa `HTTPBearer` + comparação de `AUTH_TOKEN` nos endpoints `process_video`/`download_youtube` (401 se inválido) |
| Backend local (`local_server.py`) autentica as mesmas rotas | ✅ *(corrigido)* | `local_server.py` agora usa `HTTPBearer` + `verify_auth_token` (mesmo padrão de `main.py`) nos endpoints `/download_youtube` e `/process_video`. 8/8 testes passando (`tests/test_local_server.py`) |
| Rota interna `/api/local-storage` exige sessão | ✅ *(corrigido)* | `GET`/`PUT`/`DELETE` agora exigem `getUserId()` |

Sem gaps abertos nesta categoria.

---

## V3 — Gestão de Sessão

| Controle | Status | Evidência |
|---|---|---|
| Gestão de sessão (cookies, expiração, rotação) | ✅ | Delegada inteiramente ao Clerk — fora do escopo de código próprio |
| Nenhuma sessão/token customizado sendo gerenciado manualmente | ✅ | Não há implementação própria de JWT/cookie de sessão no repo |

Sem gaps identificados aqui além do que o próprio Clerk garante.

---

## V4 — Controle de Acesso (Autorização / IDOR)

| Controle | Status | Evidência |
|---|---|---|
| Recursos verificam dono antes de ler/alterar | ✅ (padrão predominante) | `Clip.isOwnedBy(userId)` em `get-clip-play-url`, `delete-clip`, `update-clip`; `file.userId !== input.userId` em `delete-project`, `rename-project`, `retry-project` |
| `processVideo` / `TriggerVideoProcessingUseCase` verifica dono | ✅ *(corrigido nesta sessão)* | Antes: buscava só por `uploadedFileId`, sem checar `userId` — qualquer um que soubesse o ID de outro usuário disparava processamento (e consumo de créditos) do vídeo alheio. Agora exige `userId` e lança `UnauthorizedError` se não bate |
| `/api/local-storage` não permite acessar arquivo de outro usuário/fora do diretório | ✅ *(corrigido nesta sessão)* | Path traversal (`key=/etc/passwd`, `key=../../..`) agora rejeitado com 400 antes de tocar o filesystem |
| `/api/local-storage` impede acessar a key de **outro usuário dentro do próprio diretório** | ✅ *(corrigido)* | `GET`/`PUT` agora chamam `isOwnedByUser()`, que busca a key em `UploadedFile`/`Clip` e confirma `userId` antes de tocar o arquivo — retorna 404 tanto para key inexistente quanto para key de outro dono (não dá pra diferenciar as duas coisas de fora) |

Sem gaps abertos nesta categoria.

---

## V5 — Validação, Sanitização e Codificação

| Controle | Status | Evidência |
|---|---|---|
| Validação de schema (Zod) nas actions/rotas | ✅ *(corrigido)* | Além de `updateClip` (`update-clip.schema.ts`) e `generateUploadUrl` (`generate-upload-url.schema.ts`), todas as actions que faltavam agora validam com Zod na borda, antes de qualquer lógica de negócio: `projects-actions.ts` (`src/domain/schemas/projects-actions.schema.ts`), `stripe.ts` (`src/domain/schemas/stripe-actions.schema.ts`), `youtube-info.ts` (`src/domain/schemas/youtube-info.schema.ts`), `youtube.ts`/`importYouTubeVideo` (`src/domain/schemas/import-youtube-video.schema.ts`) e `generation.ts`/`processVideo` (`src/domain/schemas/process-video.schema.ts`). **Achado corrigido — `priceId` arbitrário no checkout**: `createCheckoutSession` usava a string crua recebida do cliente como price id real no Stripe quando ela não batia com nenhuma das 4 chaves (abusável chamando a Server Action diretamente); agora `priceId` é `z.enum` das 4 chaves (`starter_monthly`, `starter_annual`, `pro_monthly`, `pro_annual`) e o price id vem sempre de `PRICE_IDS[chave]`. **Achado corrigido — open redirect em `returnUrl`** do Billing Portal: só aceita path relativo iniciado por `/`, sem `//`, sem `\` e sem espaços/caracteres de controle (bloqueia `https://evil.com`, `//evil.com`, `/\evil.com`, `/<TAB>/evil.com`, `javascript:`), e a action ancora o path no `BASE_URL` com checagem de origem. Em `retryProjectAction`, `clipModel`/`aspectRatio` são validados contra `getProcessingOptions()` (fail-closed) e `subtitlePreset` contra a lista de presets da UI. Em `importYouTubeVideo`/`processVideo`, `manualCuts` agora valida forma e exige `endTime > startTime` via `manualCutSchema` compartilhado (máx. 50 cortes por importação, limite de sanidade documentado em comentário — sem requisito de produto confirmado), e `mode` é restrito a `z.enum(["auto","manual"])` |
| Campos de tipo `unknown`/livre indo direto ao banco | ✅ *(corrigido)* | `updateClip` agora valida `transcriptWords` como array de `{word, start, end}` via `updateClipSchema` antes de persistir |
| Upload restrito a vídeo, com limite de tamanho | ✅ *(corrigido)* | `generateUploadUrlSchema`: `contentType` num allowlist de mimetypes de vídeo, `fileSizeBytes` obrigatório e ≤ 2GB. No S3 o limite é reforçado via `ContentLength` assinado na presigned URL; no storage local o stream do `PUT` é abortado (413) e o arquivo parcial removido se exceder |
| Validação de SSRF em input de URL externa | ✅ | Import de YouTube persiste `youtubeUrl.canonicalUrl` (não a URL crua) e o backend valida host (`youtube.com`/`youtu.be`) antes de chamar yt-dlp |
| Prevenção de XSS (escaping de conteúdo dinâmico) | ✅ (por padrão do React/Next) | Sem uso de `dangerouslySetInnerHTML` identificado nas áreas revisadas |

Sem gaps abertos nesta categoria — todas as actions/rotas identificadas agora validam com Zod na borda.

---

## V7 — Tratamento de Erros e Logging

| Controle | Status | Evidência |
|---|---|---|
| Erros não vazam stack trace/detalhes internos ao cliente | ✅ (geral) | Actions capturam `DomainError` e retornam só `error.message`; erros genéricos viram mensagem curta |
| Logging estruturado de eventos de segurança (auth negada, IDOR bloqueado) | ❌ | Não há logger estruturado (`pino`/`winston`/etc.) no projeto. `UnauthorizedError` capturado nas actions vira só `{success:false}` para o client — **nada é logado no servidor** quando um acesso é negado |
| Logs não vazam segredos/payloads sensíveis | ✅ | Nenhum log identificado imprimindo corpo de webhook, token ou `Authorization` header |
| Verificação de assinatura de webhook logada em caso de falha | ✅ | Stripe e Clerk webhooks logam (`console.error`/`console.warn`) falha de verificação de assinatura |

**Gaps abertos**: ausência de logging estruturado/observabilidade para tentativas de acesso negado (P2 — relevante para detectar tentativas de exploração dos IDOR corrigidos nesta sessão).

---

## V8 — Proteção de Dados

| Controle | Status | Evidência |
|---|---|---|
| Separação clara de env vars server vs. client | ✅ | `src/env.js` (`@t3-oss/env-nextjs`) só expõe `NEXT_PUBLIC_*` ao client; secrets (`STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`, `AWS_SECRET_ACCESS_KEY`, etc.) ficam em `server{}` |
| Nenhum secret hardcoded no código versionado | ✅ | Nenhum token/chave real encontrado em código-fonte; `.env`/`.env.local` não estão trackeados no git (só `.env.example`) |
| Backend usa token estático só para dev/teste local | ⚠️ | `main.py` tem `"Bearer 123123"` hardcoded no `local_entrypoint` — só roda via `modal run` localmente, não em produção, mas vale confirmar que nunca é usado como default de `AUTH_TOKEN` real |

Sem gaps críticos novos aqui além do já registrado em V2 (`local_server.py`).

---

## V9 — Comunicação

| Controle | Status | Evidência |
|---|---|---|
| Cabeçalhos de segurança HTTP (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | ✅ *(corrigido)* | `next.config.js::headers()` agora aplica os 5 em todas as rotas. Testado (`tests/unit/next-config.test.ts`) |
| Content-Security-Policy | ❌ *(deliberadamente adiado)* | Não incluído ainda — uma CSP mal calibrada pode quebrar os widgets do Clerk/Stripe, que carregam script/iframe de domínios próprios. Exige testar ao vivo o login e o checkout antes de habilitar, não só ler código; documentado como nota no próprio `next.config.js` |
| CORS explícito e restritivo (frontend) | ✅ | Comunicação é majoritariamente same-origin (Next.js App Router); CORS do S3 corrigido na Fase 0 (deixou de usar `AllowedOrigins: ["*"]`) |
| CORS explícito no backend FastAPI | ❌ | Nem `main.py` nem `local_server.py` configuram `CORSMiddleware` — comportamento padrão do FastAPI (sem CORS habilitado), o que bloqueia browsers cross-origin por omissão, mas não há política documentada/testada |
| HTTPS obrigatório em produção | ✅ (assumido via plataforma) | Depende do provedor de deploy (Vercel/Modal), não há downgrade explícito para HTTP no código |

**Gaps abertos**: CSP ainda não habilitada (P1 — precisa de teste ao vivo do login/checkout antes de ligar); CORS do backend Python (P2).

---

## V11 — Lógica de Negócio (Rate Limiting / Anti-automação)

| Controle | Status | Evidência |
|---|---|---|
| Rate limit em geração de upload URL | ✅ *(Fase 1, já entregue)* | `generateUploadUrl` — 10/min por usuário |
| Rate limit em import de YouTube | ✅ *(Fase 1, já entregue)* | `importYouTubeVideo` — 5/min por usuário |
| Rate limit em `processVideo`, `getClipPlayUrl`, `deleteClip`, `updateClip` | ❌ | Nenhuma chamada ao rate limiter |
| Rate limit em actions de projeto (`loadMoreProjectsAction`, `deleteProjectAction`, `renameProjectAction`, `retryProjectAction`) | ❌ | Idem |
| Rate limit em actions de billing (`createCheckoutSession`, `createCustomerPortalSession`) | ❌ | Idem — potencial abuso para gerar sessões Stripe em loop |
| Rate limit em `fetchYouTubeVideoInfo`/`/api/youtube/info` | ❌ | Endpoint faz fetch outbound para `youtube.com` sem autenticação nem limite — abusável para flood de requisições outbound às custas do servidor |
| Rate limit nos endpoints do backend Python (`/process_video`, `/download_youtube`) | ❌ | Nenhum throttling (`slowapi`/`Limiter`/etc.) em `main.py` nem `local_server.py`. Único controle é o Bearer token estático — sem limite de tentativas |
| Rate limiter atual é garantia *global* (multi-instância) | ⚠️ | `InMemorySlidingWindowRateLimiter` é por processo — documentado no próprio código; não é garantia dura em ambiente serverless/multi-instância |

**Gaps abertos**: cobertura de rate limit ainda parcial — as duas actions mais caras (upload/import) estão protegidas, mas o restante da superfície (incluindo os 2 endpoints do backend Python que efetivamente consomem GPU) não está (P0/P1 dependendo do endpoint — os do backend Python são os mais caros de abusar).

---

## V12 — Arquivos e Recursos

| Controle | Status | Evidência |
|---|---|---|
| Path traversal em endpoints de arquivo | ✅ | `/api/local-storage` sandboxed contra `UPLOAD_DIR` |
| Upload restringe tipo/tamanho de arquivo | ✅ *(corrigido)* | Ver V5 — `generateUploadUrlSchema` (vídeo apenas, ≤2GB) |

Sem gaps abertos nesta categoria.

---

## V13 — API e Serviços Web

| Controle | Status | Evidência |
|---|---|---|
| Versionamento/consistência de contrato de API | ✅ (não aplicável — server actions tipadas) | |
| CORS do backend Python | ❌ | Ver V9 |
| Rate limiting em endpoints de API | ❌ | Ver V11 |

---

## V14 — Configuração

| Controle | Status | Evidência |
|---|---|---|
| Dependências com vulnerabilidade alta/crítica bloqueiam CI | ✅ *(Fase 0, já entregue)* | `npm audit --audit-level=high` no `ci.yml` — hoje **falha de propósito** (9 high + 2 critical existentes, aguardando correção/priorização separada) |
| Versão do Next.js além do patch de CVE-2025-29927 (bypass de middleware) | ✅ | Next 15.3.2 instalado, posterior ao patch (15.2.3+) |
| Cabeçalhos de segurança configurados centralmente | ✅ *(corrigido)* | Ver V9 |
| CORS do S3 restrito a origens explícitas | ✅ *(Fase 0, já entregue)* | Ver `README.md` |

---

## Resumo executivo

**Corrigido até agora:**
- Idempotência de webhook Stripe
- CORS do S3 sem wildcard
- Gate de `npm audit` no CI
- SSRF no import de YouTube (frontend + backend)
- Rate limiting em upload/import de YouTube (10/min e 5/min)
- **IDOR crítico em `processVideo`/`TriggerVideoProcessingUseCase`**
- **Path traversal + falta de auth em `/api/local-storage`**
- **`/api/local-storage` agora valida ownership da key contra o banco** (V4)
- **`local_server.py` agora exige `AUTH_TOKEN`** (V2)
- **Validação Zod em `updateClip` e `generateUploadUrl`** (V5)
- **Validação Zod em `projects-actions.ts`, `stripe.ts`, `youtube-info.ts`, `youtube.ts` e `generation.ts`** — Zod agora cobre todas as actions identificadas no levantamento original (V5)
- **`createCheckoutSession` não aceita mais `priceId` arbitrário** — antes repassava ao Stripe a string crua do cliente quando ela não era uma das 4 chaves; agora só as 4 chaves via `z.enum` (V5)
- **Open redirect em `returnUrl` do Billing Portal** — só path relativo seguro, ancorado no `BASE_URL` (V5)
- **Upload restrito a vídeo, com limite de 2GB** (V5/V12)
- **Cabeçalhos de segurança HTTP no Next.js** (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS) (V9/V14)

**Gaps em aberto, por prioridade sugerida:**

| Prioridade | Item | Área |
|---|---|---|
| P0 | Rate limiting nos endpoints do backend Python (`process_video`, `download_youtube`) — são os que efetivamente custam GPU. *Adiado a pedido — será feito com calma, como estudo de caso de rate limiting* | V11 |
| P1 | Content-Security-Policy — precisa testar login/checkout ao vivo antes de habilitar | V9 |
| P1 | Rate limit ausente nas demais actions sensíveis (projetos, billing, `youtube/info`) — *idem, adiado* | V11 |
| P2 | Logging estruturado de eventos de autorização negada | V7 |
| P2 | CORS explícito no backend FastAPI | V9 |
| P2 | Rate limiter é por instância/processo, não é garantia global em multi-instância | V11 |

Este documento não implementa nenhuma correção — é o material de decisão para priorizar os próximos itens. Detalhe de regras de negócio e status de implementação por feature: `docs/casos-de-uso-e-regras-de-negocio.md`.
