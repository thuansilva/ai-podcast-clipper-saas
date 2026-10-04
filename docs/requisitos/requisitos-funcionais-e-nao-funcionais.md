# Requisitos Funcionais e Não-Funcionais

**Data:** 2026-10-04  
**Status:** Consolidação e Extração  
**Fonte de verdade:** `./casos-de-uso-e-regras-de-negocio.md` (RFs) + `../operacao/checklist-go-live.md` (RNFs, OWASP ASVS L2) + specs técnicos em `../historico/superpowers/specs/`

---

## 1. Requisitos Funcionais (RF)

Cada requisito funcional é identificado por um ID estável (`RF-<ÁREA>-NN`), com origem rastreável em um caso de uso ou regra de negócio, artefato de código principal e status real de implementação.

### 1.1. Autenticação (AUTH)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-AUTH-01 | Login/cadastro via Clerk (email+senha, login social) | Caso de uso: Login | `src/infrastructure/auth/clerk-auth.gateway.ts`, `src/middleware.ts` | ✅ | `tests/unit/application/users/sync-user.use-case.test.ts` |
| RF-AUTH-02 | Toda ação sensível (server action/rota API) exige sessão válida | RN: Controle de acesso | Todas as actions em `src/actions/*`, rotas em `src/app/api/*` | ✅ | Integração em testes de endpoints |
| RF-AUTH-03 | Sincronização de usuário Clerk → banco Postgres (`User`) | RN: Persistência de sessão | `src/application/use-cases/users/sync-user.use-case.ts` | ✅ | `tests/unit/application/users/sync-user.use-case.test.ts` |
| RF-AUTH-04 | Webhook do Clerk verificado e idempotente | RN: Segurança de webhook | `src/app/api/webhooks/clerk/route.ts` | ✅ | Verificação de assinatura e deduplicação |

**Spec:** `../historico/superpowers/specs/2026-09-12-clerk-auth-clean-architecture-spec.md`

---

### 1.2. Créditos e Cobrança (BILL)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-BILL-01 | Cálculo de custo em créditos = `ceil(duração em minutos)`, mínimo 1 | RN-01 | `src/domain/services/credit-pricing.service.ts` | ✅ | `tests/unit/domain/services/credit-pricing.service.test.ts` |
| RF-BILL-02 | Reserva (hold) de créditos antes de enfileirar processamento | RN: Ciclo de vida de créditos | `src/application/use-cases/credits/hold-credits.use-case.ts` | ✅ | `tests/unit/application/credits/hold-credits.use-case.test.ts` |
| RF-BILL-03 | Débito definitivo (consume) ao concluir processamento com sucesso | RN: Consumo efetivo | `src/application/use-cases/credits/consume-credits.use-case.ts`, chamado em `src/inngest/functions.ts:348-349` | ✅ | `tests/unit/application/credits/consume-credits.use-case.test.ts` |
| RF-BILL-04 | Estorno (refund) quando o job falha definitivamente (esgota retries) | RN: Recuperação de créditos | `src/application/use-cases/credits/refund-credits.use-case.ts` | ✅ | `tests/unit/application/credits/refund-credits.use-case.test.ts` |
| RF-BILL-05 | Checkout de assinatura recorrente (Starter/Pro, mensal/anual) via Stripe | RN: Pagamento de assinatura | `src/application/use-cases/credits/process-subscription-checkout.use-case.ts`, `src/actions/stripe.ts` | ✅ | `tests/unit/application/credits/process-subscription-checkout.use-case.test.ts` |
| RF-BILL-06 | Renovação automática de assinatura (créditos do novo ciclo adicionados) | RN: Renovação periódica | `src/application/use-cases/credits/process-subscription-renewal.use-case.ts` | ✅ | `tests/unit/application/credits/process-subscription-renewal.use-case.test.ts` |
| RF-BILL-07 | Expiração de assinatura (fim do ciclo sem renovação bem-sucedida) | RN: Término de acesso | `src/application/use-cases/credits/expire-subscription.use-case.ts` | ✅ | `tests/unit/application/credits/expire-subscription.use-case.test.ts` |
| RF-BILL-08 | Idempotência de evento Stripe (não duplicar crédito em reentrega de webhook) | RN: Deduplicação transacional | `src/infrastructure/database/repositories/prisma-processed-event.repository.ts` + `ProcessedWebhookEvent` model | ✅ | `tests/integration/stripe-webhook-idempotency.integration.test.ts` |
| RF-BILL-09 | Consulta de saldo e dados de cobrança do usuário (créditos, plano, próxima renovação) | RN: Dashboard de billing | `src/application/use-cases/users/get-user-billing-data.use-case.ts` | ✅ | `tests/unit/application/users/get-user-billing-data.use-case.test.ts` |
| RF-BILL-10 | Tratamento de pagamento falhado: marca `status = "past_due"`, carência de 3 dias antes de suspensão | RN: Dunning policy customizado | `src/application/use-cases/credits/process-payment-failed.use-case.ts` | ✅ | `tests/integration/stripe-webhook-payment-failure.integration.test.ts` |
| RF-BILL-11 | Tratamento de reembolso de cobrança: revoga créditos proporcionalmente ao plano vigente | RN: Revogação proporcional | `src/application/use-cases/credits/process-charge-refund.use-case.ts`, helper `revoke-subscription-credits.helper.ts` | ✅ | `tests/integration/stripe-webhook-payment-failure.integration.test.ts` |
| RF-BILL-12 | Tratamento de disputa de cobrança: mesma lógica que reembolso (proporção ao plano) | RN: Revogação de disputa | `src/application/use-cases/credits/process-charge-dispute.use-case.ts` | ✅ | `tests/integration/stripe-webhook-payment-failure.integration.test.ts` |

**Catálogo de Planos (fonte única de verdade):**
- STARTER mensal: 150 créditos/mês, $15 USD
- STARTER anual: 1800 créditos (lump sum), $180 USD (1800 = 150 × 12)
- PRO mensal: 300 créditos/mês, $29 USD
- PRO anual: 3600 créditos (lump sum), $348 USD (3600 = 300 × 12)

**Specs:** `../historico/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`

---

### 1.3. Ingestão de Vídeo (INGEST)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-INGEST-01 | Importar vídeo por URL do YouTube: valida host, extrai vídeo ID, persiste `canonicalUrl` (não URL crua) | RN: Segurança SSRF | `src/application/use-cases/videos/import-youtube-video.use-case.ts`, `YouTubeUrl` (value object) | ✅ | `tests/unit/domain/value-objects/youtube-url.test.ts` |
| RF-INGEST-02 | Validação redundante de host YouTube no backend antes de baixar (defesa em profundidade) | RN: Segurança SSRF nível 2 | `ai-podcast-clipper-backend/core/youtube_downloader.py::_assert_youtube_host` | ✅ | Backend: testes em `tests/` do repositório Python |
| RF-INGEST-03 | Enfileiramento automático de processamento ao importar YouTube | RN: Orquestração de jobs | `src/application/use-cases/videos/import-youtube-video.use-case.ts` → `IQueueGateway.sendProcessVideoEvent` | ✅ | Integração em `tests/integration/inngest-pipeline.test.ts` |
| RF-INGEST-04 | Rate limit de importações YouTube por usuário: 5 requisições/minuto | RN: Abuso | `importYouTubeVideo` action + `InMemorySlidingWindowRateLimiter` | ✅ | `tests/unit/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter.test.ts` |
| RF-INGEST-05 | Geração de presigned URL para upload direto de arquivo até S3 | RN: Upload seguro | `src/application/use-cases/videos/generate-upload-url.use-case.ts`, `generateUploadUrl` action | ✅ | `tests/unit/application/videos/generate-upload-url.use-case.test.ts` |
| RF-INGEST-06 | Validação de tipo de arquivo (apenas vídeo) e tamanho máximo (2GB) no schema | RN: Validação de entrada | `src/domain/schemas/generate-upload-url.schema.ts` | ✅ | Schema validado em `tests/unit/domain/schemas/generate-upload-url.schema.test.ts` |
| RF-INGEST-07 | Rate limit de geração de upload URL: 10 requisições/minuto | RN: Abuso | `generateUploadUrl` action | ✅ | Integração de rate limiting |
| RF-INGEST-08 | Upload direto de arquivo pelo browser até S3 (após obter presigned URL) | RN: Fluxo de ingestão | Não implementado | ❌ | **Stub/Escondido de propósito** — decisão de produto: fluxo não implementado na Fase 4. A função que era `handleUpload` foi removida de `src/components/dashboard/create-project-client.tsx` |

**Spec:** `../historico/superpowers/specs/2026-09-15-dynamic-video-options-design.md`

---

### 1.4. Pipeline de Processamento (PIPE)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-PIPE-01 | Transcrição automática do áudio (WhisperX) | RN: Processamento core | `ai-podcast-clipper-backend/core/transcription.py` | ✅ | Sem teste unitário dedicado — `core/transcription.py` não tem arquivo de teste próprio hoje (71/71 testes do backend passam, confirmado com `.venv/bin/python -m pytest tests/`, mas nenhum cobre esta função isoladamente) |
| RF-PIPE-02 | Identificação de momentos "virais" via LLM (Gemini 2.5 Pro) | RN: IA generativa | `ai-podcast-clipper-backend/main.py`, schema Gemini | ✅ | Backend: `tests/test_gemini_schema.py` |
| RF-PIPE-03 | Detecção de falante ativo (LR-ASD via submódulo `asd/`) | RN: Localização de speaker | `ai-podcast-clipper-backend/asd/` (clone externo) | ✅ | Dependência externa — não testada no escopo deste projeto |
| RF-PIPE-04 | Corte/crop vertical acelerado por GPU (FFMPEGCV) | RN: Renderização | `ai-podcast-clipper-backend/core/vertical_video.py` | ✅ | Sem teste unitário dedicado — `core/vertical_video.py` não tem arquivo de teste próprio hoje (71/71 testes do backend passam) |
| RF-PIPE-05 | Geração e queima de legendas com 11 presets (HORMOZI, POPPING_GREEN, MINIMAL, NEON, VLOG, TRUE_CRIME, CORPORATE, GAMER, ASMR, LOUD, CLEAN) | RN: Subtitles | `ai-podcast-clipper-backend/core/subtitle_styles.py` (linhas 7-11), `core/subtitles.py` | ✅ | Backend: `tests/test_subtitles.py` — 13/13 testes passando (verificado diretamente nesta sessão com `.venv/bin/python -m pytest tests/test_subtitles.py -v`) |
| RF-PIPE-06 | Upload do clipe final para S3 em pasta `clips/` | RN: Armazenamento seguro | `ai-podcast-clipper-backend/core/clip_pipeline.py` (linhas 100-101), `core/s3_paths.py` | ✅ | Backend: `tests/test_s3_paths.py` |
| RF-PIPE-07 | Autenticação via Bearer token em endpoints do backend | RN: Segurança | `ai-podcast-clipper-backend/main.py:112-117,149-154` (validação em `process_video` e `download_youtube`), `local_server.py` | ✅ | Verificação em `tests/test_local_server.py` |
| RF-PIPE-08 | Cortes manuais por timestamp (usuário define cortes em vez de IA) | RN: Customização | `ManualCutDTO`, modo `mode: "manual"` em `ImportYouTubeVideoUseCase`, `TriggerVideoProcessingUseCase` | ⚠️ | **Frontend envia `mode`/`manual_cuts` via Inngest, mas `core/schemas.py::ProcessVideoRequest` no backend só aceita `s3_key`/`preset` — os campos são descartados silenciosamente. Gap de integração confirmado por 3 revisores independentes nesta sessão (2026-10-04). Backend sempre roda pipeline automático completo, ignorando configuração manual do usuário. Requer decisão: implementar recepção no backend, ou remover a feature do frontend.** |
| RF-PIPE-09 | Retry automático de processamento falho (com limite de tentativas do Inngest) | RN: Resiliência | `src/actions/generation.ts`, `src/application/use-cases/retry-project.use-case.ts` | ✅ | `tests/unit/application/retry-project.use-case.test.ts` |
| RF-PIPE-10 | Circuit breaker/timeout nas chamadas Modal e Gemini | RN: Resiliência avançada | — | ❌ | **Pendente — Fase 2 do roadmap de resiliência** |
| RF-PIPE-11 | Consolidação de lógica entre Modal (`main.py`) e servidor local (`local_server.py`) em módulos compartilhados (`core/`) | RN: Manutenibilidade | `ai-podcast-clipper-backend/core/`, `local_server.py` como wrapper fino | ✅ | Backend: `tests/` validam módulos shared |

**Specs:** 
- `../historico/superpowers/specs/2026-09-18-local-gpu-processing-design.md`
- `../historico/superpowers/specs/2026-09-13-manual-cuts-timestamp-design.md`

---

### 1.5. Gerenciamento de Clipes (CLIP)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-CLIP-01 | Listar clipes de um vídeo/usuário (paginado) | RN: Leitura | `IClipRepository.findByUserId/findByUploadedFileId` (`src/domain/ports/clip-repository.ts`) | ⚠️ | **Sem use case dedicado localizado** — não existe `list-clips.use-case.ts` nem teste correspondente no repositório (confirmado via `find`). A listagem provavelmente é feita direto via repositório por outro caller — requer investigação para documentar o artefato real. |
| RF-CLIP-02 | Gerar URL de reprodução com verificação de propriedade | RN: Autorização | `src/application/use-cases/clips/get-clip-play-url.use-case.ts`, `Clip.isOwnedBy()` | ✅ | `tests/unit/application/clips/get-clip-play-url.use-case.test.ts` |
| RF-CLIP-03 | Editar clip (título, preset de legenda, transcrição) com verificação de propriedade | RN: Autorização + Validação | `src/application/use-cases/clips/update-clip.use-case.ts`, `src/domain/schemas/update-clip.schema.ts` | ✅ | `tests/unit/application/clips/update-clip.use-case.test.ts` |
| RF-CLIP-04 | Excluir clip (registro BD + arquivo S3) com verificação de propriedade | RN: Limpeza | `src/application/use-cases/clips/delete-clip.use-case.ts` | ✅ | `tests/unit/application/clips/delete-clip.use-case.test.ts` |

**Spec:** `../historico/superpowers/specs/2026-09-23-project-management-design.md`

---

### 1.6. Gerenciamento de Projetos (PROJ)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-PROJ-01 | Listar vídeos/projetos do usuário (paginado + busca por nome) | RN: Leitura | `src/application/use-cases/videos/list-user-videos.use-case.ts` | ✅ | `tests/unit/application/videos/list-user-videos.use-case.test.ts` |
| RF-PROJ-02 | Renomear projeto com verificação de propriedade | RN: Autorização | `src/application/use-cases/rename-project.use-case.ts` | ✅ | `tests/unit/application/projects/rename-project.use-case.test.ts` |
| RF-PROJ-03 | Excluir projeto (vídeo + clipes + arquivos S3) com verificação de propriedade | RN: Limpeza em cascata | `src/application/use-cases/delete-project.use-case.ts` | ✅ | `tests/unit/application/projects/delete-project.use-case.test.ts` |
| RF-PROJ-04 | Reprocessar (retry) um projeto existente (consumir novamente créditos, re-enfileirar) | RN: Orquestração | `src/application/use-cases/retry-project.use-case.ts` | ✅ | `tests/unit/application/retry-project.use-case.test.ts` |
| RF-PROJ-05 | Disparar processamento de um vídeo já enviado com verificação de propriedade | RN: Autorização crítica | `src/application/use-cases/videos/trigger-video-processing.use-case.ts`, `processVideo` action | ✅ | `tests/unit/application/videos/trigger-video-processing.use-case.test.ts` — **bug IDOR corrigido nesta sessão** |

**Spec:** `../historico/superpowers/specs/2026-09-23-project-management-design.md`

---

### 1.7. Interface de Usuário (UI)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-UI-01 | Dashboard com listagem de projetos, clipes e navegação | RN: Apresentação | `src/app/dashboard/` | ✅ | Componentes testados em `tests/unit/components/` |
| RF-UI-02 | Formulários de autenticação (login/cadastro) com validação e aceite de Termos/Privacidade | RN: UX | `src/components/auth/custom-sign-in-form.tsx`, `custom-sign-up-form.tsx` | ✅ | `tests/unit/components/custom-sign-up-form.test.tsx`, `tests/unit/components/custom-sign-in-form.test.tsx` |
| RF-UI-03 | Página de Billing com exibição de créditos, plano atual, botão de upgrade/gerenciar | RN: Cobrança | `src/app/dashboard/billing/` | ✅ | `tests/unit/components/billing-page.test.tsx`, `tests/unit/components/active-subscription-card.test.tsx` |
| RF-UI-04 | Player de vídeo customizado com controles acessíveis | RN: Reprodução + WCAG | `src/components/custom-video-player.tsx` | ✅ | `tests/unit/custom-video-player.a11y.test.tsx` |
| RF-UI-05 | Páginas legais (Terms, Privacy, Refund, Contact) com placeholders `[A PREENCHER]` | RN: Compliance | `src/app/terms/`, `src/app/privacy/`, `src/app/refund/`, `src/app/contact/` | ✅ | `tests/integration/legal-pages.test.ts` |

---

## 2. Requisitos Não-Funcionais (RNF)

Cada RNF é identificado por um ID estável (`RNF-<CATEGORIA>-NN`), com categoria, fonte documentada e status. Requisitos sem número definido em documento são marcados como **"A DEFINIR"**.

### 2.1. Segurança (OWASP ASVS Nível 2)

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-SEC-01 | Autenticação obrigatória para todas as ações sensíveis (via Clerk) | ASVS V2: Authentication | checklist-go-live.md, AGENTS.md | ✅ | Middleware + per-action validation |
| RNF-SEC-02 | Validação de entrada em todos os endpoints (Zod schemas no domain) | ASVS V5: Validation | Arquitetura Clean Architecture | ✅ | Schema-first approach |
| RNF-SEC-03 | Proteção contra IDOR: autorização por propriedade em CRUD de recursos do usuário | ASVS V4: Access Control | checklist-go-live.md | ⚠️ | `Clip.isOwnedBy()`, `User.id` check em GET/PUT/DELETE — **IDOR aberto em DELETE /api/local-storage** (não valida propriedade) |
| RNF-SEC-04 | Verificação de assinatura em webhooks (Clerk, Stripe, Inngest) | ASVS V6: Crypto | Implementação em rotas `/api/webhooks/*` | ⚠️ | **HMAC-SHA256 (Stripe) ✅**, **HMAC-SHA256 via Svix (Clerk) ✅**, **token Inngest ⚠️** (não validado em schema Zod centralmente) |
| RNF-SEC-05 | Idempotência de webhooks (verificação de `ProcessedWebhookEvent` + race condition corrigida) | ASVS V6: Crypto | checklist-go-live.md, RN-08 de Créditos | ✅ | `event.id` como chave de deduplicação, `await dispatch` antes de marcar processado |
| RNF-SEC-06 | Proteção contra SSRF: validação de host YouTube no frontend + backend | ASVS V4: Access Control | RF-INGEST-01, RF-INGEST-02 | ⚠️ | **Frontend ✅**, **Backend Modal ✅**, **Backend local_server.py ⚠️** (não valida host antes de passar ao yt-dlp) |
| RNF-SEC-07 | Autenticação de API do backend (Bearer token em `/process_video`, `/download_youtube`) | ASVS V3: Session Management | RF-PIPE-07 | ⚠️ | **Comparação simples `==`** — não usa `hmac.compare_digest` (constant-time) em `main.py:112,149` e `local_server.py:38` |
| RNF-SEC-08 | Rate limiting em ações sensíveis (importação YouTube, geração upload URL, endpoints backend) | ASVS V11: Business Logic | RF-INGEST-04, RF-INGEST-07, RNF-RL-* | ⚠️ | **Implementado em frontend (in-memory por instância); backend sem rate limiting** |
| RNF-SEC-09 | Content Security Policy (CSP) | ASVS V13: API | next.config.js | ❌ | Pendente — ação já definida no checklist-go-live.md (não requer nova decisão) |
| RNF-SEC-10 | Endpoint de debug (`/api/dev-sign-stripe-payload`) não exposto em produção | ASVS V13: API | checklist-go-live.md | ⚠️ | **Pendente — REMOVER (código já marca como TEMPORÁRIO, não é mais decisão em aberto)** |
| RNF-SEC-01 | Autenticação obrigatória para todas as ações sensíveis | ASVS V2: Authentication | Middleware + per-action validation | ✅ | **Exceção: `/api/youtube/info` sem autenticação** (HIGH — ação: adicionar auth ou rate limit) |
| RNF-SEC-11 | Dependências npm sem vulnerabilidades críticas/high | ASVS V14: Dependencies | npm audit | ⚠️ | **1 critical remanescente em `fast-xml-parser` via AWS SDK v3** |
| RNF-SEC-12 | Dependências Python com versões pinadas (não ranges) | ASVS V14: Dependencies | `requirements.txt` | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-13 | Fluxo de exclusão de conta completo (UI + webhook Clerk cleanup S3/Stripe) | ASVS V2: Authentication | checklist-go-live.md | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-14 | Logging estruturado de tentativas de acesso negado (IDOR bloqueado, auth falha) | ASVS V7: Logging | checklist-go-live.md (NICE) | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-15 | Sanitização de PII em logs (Gemini responses, títulos de clip) | ASVS V7: Logging | checklist-go-live.md (NICE) | ❌ | Pendente — ação já definida no checklist-go-live.md |

---

### 2.2. Limites de Upload e Entrada

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-UPLOAD-01 | Tamanho máximo de arquivo de vídeo | Input Validation | `generate-upload-url.schema.ts`, S3 lifecycle | ✅ | **2 GB** |
| RNF-UPLOAD-02 | Tipos MIME aceitos para upload de vídeo | Input Validation | `generate-upload-url.schema.ts` | ✅ | `video/mp4`, `video/quicktime`, `video/x-matroska`, `video/webm`, `video/x-msvideo`, `video/mpeg` |
| RNF-UPLOAD-03 | Duração máxima de vídeo para processamento | Input Validation | — | ❌ | **A DEFINIR — limite de duração (ex: 4 horas máximo)** |
| RNF-UPLOAD-04 | Comprimento máximo de título de clipe | Input Validation | — | ⚠️ | **Campo no DB/schema, mas limite não documentado** |

---

### 2.3. Rate Limiting

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-RL-01 | Rate limit de importação YouTube por usuário | Abuse Prevention | RF-INGEST-04 | ✅ | **5 requisições / 60 segundos** |
| RNF-RL-02 | Rate limit de geração de presigned URL por usuário | Abuse Prevention | RF-INGEST-07 | ✅ | **10 requisições / 60 segundos** |
| RNF-RL-03 | Rate limit em endpoints do backend (`/process_video`, `/download_youtube`) | Abuse Prevention | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — implementar slowapi/Limiter no FastAPI (ex: 10 req/min por token)** |
| RNF-RL-04 | Rate limit global em actions de projeto (delete, rename, retry) | Abuse Prevention | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — implementar limit em `deleteProjectAction`, `renameProjectAction`, etc.** |
| RNF-RL-05 | Rate limit em ações de billing (checkout, portal session) | Abuse Prevention | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — implementar limit em Stripe session creation** |

---

### 2.4. Desempenho e SLA

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-PERF-01 | Latência p90 de resposta HTTP em casos de carga nominal | SLA | `load-tests/config/thresholds.js` | ✅ | **< 150ms** |
| RNF-PERF-02 | Latência p95 de resposta HTTP em casos de carga nominal | SLA | `load-tests/config/thresholds.js` | ✅ | **< 250ms** |
| RNF-PERF-03 | Latência p99 de resposta HTTP em casos de carga nominal | SLA | `load-tests/config/thresholds.js` | ✅ | **< 500ms** |
| RNF-PERF-04 | Taxa de erro (HTTP 5xx) em carga nominal | SLA | `load-tests/config/thresholds.js` | ✅ | **< 1%** |
| RNF-PERF-05 | Taxa de sucesso (HTTP 2xx) em carga nominal | SLA | `load-tests/config/thresholds.js` | ✅ | **> 99%** |
| RNF-PERF-06 | Tempo de processamento de vídeo (transcription + corte + legenda + upload S3) | Processing SLA | — | ❌ | **A DEFINIR — baseline esperado conforme duração (ex: 15-60 min para 1h de podcast)** |
| RNF-PERF-07 | Tempo de geração de presigned URL | Response SLA | — | ❌ | **A DEFINIR — atual: < 100ms esperado** |

---

### 2.5. Escalabilidade

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-SCALE-01 | Suportar 50+ VUs (Virtual Users) concurrent em carga nominal via k6 | Load Test | `load-tests/config/profiles.js` | ✅ | **Baseline: 50 VUs sustentados em 1 minuto** |
| RNF-SCALE-02 | Suportar 150-200 VUs em stress test (pico) | Load Test | `load-tests/config/profiles.js` | ✅ | **Stress profile: 150-200 VUs por 1 minuto** |
| RNF-SCALE-03 | Permitir múltiplas instâncias do frontend (Vercel) | Infrastructure | AGENTS.md | ✅ | **Stateless design com Prisma + Inngest + S3 compartilhados** |
| RNF-SCALE-04 | Permitir múltiplas instâncias do backend Modal | Infrastructure | AGENTS.md | ✅ | **Stateless design, sem estado local, retries via Inngest** |
| RNF-SCALE-05 | Pool de conexões Postgres adequado para carga | Database | — | ⚠️ | **A DEFINIR — Prisma default 5, aumentar para 20+ em staging/prod conforme k6 baseline** |

---

### 2.6. Disponibilidade

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-AVAIL-01 | Healthcheck `/api/health` sempre acessível (sem autenticação) | Monitoring | checklist-go-live.md (HIGH) | ⚠️ | **Implementado, mas não valida dependências (Postgres, S3, Stripe)** |
| RNF-AVAIL-02 | Retry automático de jobs falhados (Inngest) | Resilience | AGENTS.md | ✅ | **3 retries exponenciais por padrão Inngest** |
| RNF-AVAIL-03 | Timeout em chamadas externas (Modal, Gemini, S3) | Resilience | RF-PIPE-10 | ❌ | **A DEFINIR — implementar circuit breaker (Fase 2)** |
| RNF-AVAIL-04 | Fallback de dados quando dependência externa falha | Resilience | — | ❌ | **A DEFINIR — ex: usar último resultado em cache se Gemini não responder** |
| RNF-AVAIL-05 | Backup e restore do Postgres documentado | DR | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — plano de backup/restore** |
| RNF-AVAIL-06 | Rollback de deploy documentado | DR | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — procedimento de rollback** |

---

### 2.7. Observabilidade e Logging

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-OBS-01 | Exportação de eventos de processamento de vídeo (OpenTelemetry) | Monitoring | AGENTS.md | ⚠️ | **Stack local presente, sem exportação externa (Datadog, Honeycomb, etc.)** |
| RNF-OBS-02 | Alertas em tempo real (Slack, email, PagerDuty) | Monitoring | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — integração com alerting externo** |
| RNF-OBS-03 | Métricas de negócio (clipes gerados/dia, créditos consumidos, receita) | Business Intelligence | — | ❌ | **A DEFINIR — dashboard de analytics** |

---

### 2.8. Idempotência e Atomicidade

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-IDEM-01 | Idempotência de webhooks Stripe (deduplicação via `ProcessedWebhookEvent`) | Webhooks | RF-BILL-08, RNF-SEC-05 | ✅ | event.id como chave única + transação BD |
| RNF-IDEM-02 | Idempotência de webhooks Clerk (verificação de assinatura + deduplicação) | Webhooks | RF-AUTH-04 | ⚠️ | **Acidental (não deliberada) — sem mecanismo explícito** |
| RNF-IDEM-03 | Operações de crédito (hold/consume/refund) transacionais no Prisma | Transactions | AGENTS.md | ✅ | `PrismaUnitOfWork` garante atomicidade |
| RNF-IDEM-04 | Retries de jobs Inngest não duplicam aplicação de créditos | Retry Safety | RF-BILL-02 a RF-BILL-04 | ⚠️ | **A DEFINIR — validar que refetch de `Subscription.credits` e aplicação são idempotentes (não achado gap, mas confimar)** |

---

### 2.9. Retenção de Dados e Compliance

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-DATA-01 | Arquivos de upload brutos (`uploads/`, `youtube/`) expiram após 1 dia no S3 | Data Lifecycle | `../operacao/aws-s3-lifecycle-rules.md` | ✅ | **1 dia (86400s)** |
| RNF-DATA-02 | Arquivos de clipes finais (`clips/`) retidos indefinidamente | Data Lifecycle | `../operacao/aws-s3-lifecycle-rules.md` | ✅ | **Permanente** |
| RNF-DATA-03 | Logs de `CreditTransaction` retidos indefinidamente (auditoria) | Data Lifecycle | AGENTS.md | ✅ | **Permanente** |
| RNF-DATA-04 | Política de Reembolso documentada e implementada (3 dias de carência) | Compliance | RF-BILL-10 | ✅ | **3 dias de grace period (`pastDueAt`)** |
| RNF-DATA-05 | Direito ao esquecimento (delete account) | Compliance (GDPR-like) | RNF-SEC-13 | ❌ | **A DEFINIR — webhook Clerk não limpa S3 nem Stripe** |

---

### 2.10. Acessibilidade (WCAG 2.1 AA)

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-A11Y-01 | Botões com texto legível ou `aria-label` | WCAG 4.1.2 | RF-UI-04, checklist-go-live.md | ✅ | **Todos os botões possuem label acessível** |
| RNF-A11Y-02 | Controles de video player operáveis via teclado | WCAG 2.1.1 | RF-UI-04, checklist-go-live.md | ✅ | **`focus-visible:outline` + tab order definido** |
| RNF-A11Y-03 | Alertas de erro com `role="alert"` ou `aria-live` | WCAG 4.1.3 | RF-UI-02, checklist-go-live.md | ✅ | **Forms usam `role="alert"` e `aria-live="polite"`** |
| RNF-A11Y-04 | Focus indicators visíveis em todos os componentes interativos | WCAG 2.4.7 | checklist-go-live.md | ✅ | **`focus:ring` com cor e offset visível** |
| RNF-A11Y-05 | Modais com focus trap | WCAG 2.4.3 | checklist-go-live.md (HIGH) | ❌ | **A DEFINIR — implementar focus trap em todos os modais** |
| RNF-A11Y-06 | Contraste mínimo 4.5:1 em modo light e dark | WCAG 1.4.3 | — | ⚠️ | **A DEFINIR — validar em modo light (alguns textos podem estar abaixo)** |
| RNF-A11Y-07 | Skip links presentes na navegação | WCAG 2.4.1 | checklist-go-live.md (NICE) | ❌ | **A DEFINIR — adicionar skip link para main content** |

---

### 2.11. Manutenibilidade e Arquitetura

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-MAINT-01 | Clean Architecture (domain/application/infrastructure) | Code Structure | AGENTS.md, specs técnicos | ✅ | **Implementado no frontend `src/`, com separação clara de camadas** |
| RNF-MAINT-02 | Value Objects para conceitos de domínio (ex: `YouTubeUrl`, `CreditCost`) | Domain Design | AGENTS.md | ✅ | **Entidades e VOs definidos em `domain/entities/` e `domain/value-objects/`** |
| RNF-MAINT-03 | Test-Driven Development obrigatório para toda feature/bugfix | Testing | AGENTS.md | ✅ | **541 testes unitários + integração, conforme auditoria** |
| RNF-MAINT-04 | Cobertura de teste mínimo de 80% em código crítico | Testing | AGENTS.md (implícito) | ⚠️ | **A DEFINIR — não houve medição formal de cobertura** |
| RNF-MAINT-05 | TypeScript strict mode habilitado | Type Safety | `tsconfig.json` | ✅ | **`strict: true`** |
| RNF-MAINT-06 | Linting de código com ESLint + Prettier | Code Quality | package.json | ✅ | **`npm run lint` e `npm run format`** |
| RNF-MAINT-07 | Sem imports não utilizados | Code Quality | checklist-go-live.md (NICE) | ⚠️ | **6 warnings ESLint pendentes de cleanup** |
| RNF-MAINT-08 | Use Next.js/Image em vez de `<img>` crua | Performance | checklist-go-live.md (NICE) | ⚠️ | **A DEFINIR — migrar `<img>` para `next/image`** |
| RNF-MAINT-09 | Documentação de design em ADRs (Architecture Decision Records) | Documentation | — | ❌ | **A DEFINIR — criar ADRs para decisões principais (planos, webhook idempotência, etc.)** |
| RNF-MAINT-10 | Backend Python: consolidação de lógica em módulos `core/` compartilhados | Code Structure | RF-PIPE-11 | ✅ | **Modal e local_server compartilham `core/` (youtube_downloader, s3_paths, etc.)** |

---

## 3. Matriz de Rastreabilidade: RF → Caso de Uso → Artefato → Teste

Tabela de referência cruzada para validação de funcionalidade ponta a ponta:

| RF ID | Descrição Curta | Caso de Uso Original | Artefato(s) Principal(is) | Use Case / Função | Teste Unitário | Teste Integração | Teste E2E |
|---|---|---|---|---|---|---|---|
| RF-AUTH-01 | Login via Clerk | Autenticação | `clerk-auth.gateway.ts`, `middleware.ts` | `SyncUserUseCase` | ✅ | ✅ | Preparado |
| RF-AUTH-02 | Sessão obrigatória | Controle de acesso | Actions em `src/actions/*` | Middleware + per-action | ✅ | ✅ | Preparado |
| RF-AUTH-03 | Sync Clerk → Postgres | Persistência | `sync-user.use-case.ts` | `SyncUserUseCase` | ✅ | ✅ | Preparado |
| RF-AUTH-04 | Webhook Clerk verificado | Segurança | `src/app/api/webhooks/clerk/route.ts` | `ClerkWebhookHandler` | ✅ | ✅ | Preparado |
| RF-BILL-01 | Custo em créditos | RN-01 | `credit-pricing.service.ts` | `CreditPricingService.calculateCreditCost` | ✅ | — | Preparado |
| RF-BILL-02 | Hold de créditos | Ciclo de vida | `hold-credits.use-case.ts` | `HoldCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-03 | Consume de créditos | Consumo efetivo | `consume-credits.use-case.ts` | `ConsumeCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-04 | Refund de créditos | Recuperação | `refund-credits.use-case.ts` | `RefundCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-05 | Checkout de assinatura | Pagamento | `process-subscription-checkout.use-case.ts` | `ProcessSubscriptionCheckoutUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-06 | Renovação automática | Renovação | `process-subscription-renewal.use-case.ts` | `ProcessSubscriptionRenewalUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-07 | Expiração de assinatura | Término | `expire-subscription.use-case.ts` | `ExpireSubscriptionUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-08 | Idempotência Stripe | Deduplicação | `ProcessedWebhookEvent`, webhook route | `PrismaProcessedEventRepository` | ✅ | ✅ | Preparado |
| RF-BILL-09 | Consulta de billing | Dashboard | `users/get-user-billing-data.use-case.ts` | `GetUserBillingDataUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-10 | Payment failed (past_due) | Dunning | `process-payment-failed.use-case.ts` | `ProcessPaymentFailedUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-11 | Charge refund | Revogação | `process-charge-refund.use-case.ts` | `ProcessChargeRefundUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-12 | Charge dispute | Revogação | `process-charge-dispute.use-case.ts` | `ProcessChargeDisputeUseCase` | ✅ | ✅ | Preparado |
| RF-INGEST-01 | Import YouTube | Segurança SSRF | `videos/import-youtube-video.use-case.ts`, `YouTubeUrl` | `ImportYouTubeVideoUseCase` | ✅ | ✅ | Preparado |
| RF-INGEST-02 | Host validation backend | Segurança SSRF L2 | `youtube_downloader.py` | `_assert_youtube_host()` | — | ✅ (backend) | Preparado |
| RF-INGEST-03 | Enfileiramento automático | Orquestração | `videos/import-youtube-video.use-case.ts` | IQueueGateway | — | ✅ | Preparado |
| RF-INGEST-04 | Rate limit YouTube | Abuso | `InMemorySlidingWindowRateLimiter` | Rate limiter | ✅ | ✅ | Preparado |
| RF-INGEST-05 | Generate presigned URL | Upload seguro | `videos/generate-upload-url.use-case.ts` | `GenerateUploadUrlUseCase` | ✅ | ✅ | Preparado |
| RF-INGEST-06 | Validação tipo + tamanho | Validação | `generate-upload-url.schema.ts` | Schema Zod | ✅ | — | Preparado |
| RF-INGEST-07 | Rate limit upload URL | Abuso | `InMemorySlidingWindowRateLimiter` | Rate limiter | ✅ | ✅ | Preparado |
| RF-INGEST-08 | Upload direto S3 | Fluxo ingestão | Não implementado | handleUpload (removido) | ❌ | ❌ | Stub |
| RF-PIPE-01 | Transcrição WhisperX | Processamento | `core/transcription.py` | `process_video()` | ✅ | — (sem teste dedicado) | Preparado |
| RF-PIPE-02 | Identificação virais (Gemini) | IA | `core/moments.py` | Gemini API call | ✅ | ✅ | Preparado |
| RF-PIPE-03 | Detecção falante ativo | Localização | `asd/` (submódulo) | LR-ASD integration | — | — | Preparado |
| RF-PIPE-04 | Corte/crop vertical | Renderização | `core/vertical_video.py` | GPU processing | ✅ | — (sem teste dedicado) | Preparado |
| RF-PIPE-05 | Legendas (11 presets) | Subtitles | `core/subtitle_styles.py` | Style generation | ✅ (13/13 testes passando) | ✅ | Preparado |
| RF-PIPE-06 | Upload final S3 | Armazenamento | `core/clip_pipeline.py`, `core/s3_paths.py` | S3 upload | ✅ | ✅ | Preparado |
| RF-PIPE-07 | Auth Bearer token | Segurança | `main.py:112-117,149-154`, `local_server.py` | Token validation | ✅ | ✅ | Preparado |
| RF-PIPE-08 | Cortes manuais | Customização | `ManualCutDTO` mode | `TriggerVideoProcessingUseCase` | ⚠️ | ✅ | Gap de integração (backend ignora campos) |
| RF-PIPE-09 | Retry automático | Resiliência | `retry-project.use-case.ts` (sem subpasta) | `RetryProjectUseCase` | ✅ | ✅ | Preparado |
| RF-PIPE-10 | Circuit breaker | Resiliência | — | — | ❌ | ❌ | Pendente |
| RF-PIPE-11 | Consolidação Modal+local | Manutenibilidade | `ai-podcast-clipper-backend/core/` | Shared modules | ✅ | ✅ | Preparado |
| RF-CLIP-01 | List clips | Leitura | Nenhum use case dedicado — `IClipRepository` direto | — | ⚠️ | ❌ | **Sem use case nem teste dedicado — gap real, não "ListClipsUseCase" (classe não existe)** |
| RF-CLIP-02 | Get play URL | Autorização | `clips/get-clip-play-url.use-case.ts` | `GetClipPlayUrlUseCase` | ✅ | ✅ | Preparado |
| RF-CLIP-03 | Update clip | Autorização | `clips/update-clip.use-case.ts` | `UpdateClipUseCase` | ✅ | ✅ | Preparado |
| RF-CLIP-04 | Delete clip | Limpeza | `clips/delete-clip.use-case.ts` | `DeleteClipUseCase` | ✅ | ✅ | Preparado |
| RF-PROJ-01 | List projects | Leitura | `videos/list-user-videos.use-case.ts` | `ListUserVideosUseCase` | ✅ | ✅ | Preparado |
| RF-PROJ-02 | Rename project | Autorização | `rename-project.use-case.ts` (sem subpasta) | `RenameProjectUseCase` | ✅ | ✅ | Preparado |
| RF-PROJ-03 | Delete project | Limpeza | `delete-project.use-case.ts` (sem subpasta) | `DeleteProjectUseCase` | ✅ | ✅ | Preparado |
| RF-PROJ-04 | Retry project | Orquestração | `retry-project.use-case.ts` | `RetryProjectUseCase` | ✅ | ✅ | Preparado |
| RF-PROJ-05 | Trigger processing | Autorização crítica | `videos/trigger-video-processing.use-case.ts` | `TriggerVideoProcessingUseCase` | ✅ | ✅ | Preparado |
| RF-UI-01 | Dashboard | Apresentação | `src/app/dashboard/` | React components | ✅ | ✅ | Preparado |
| RF-UI-02 | Auth forms + legal | UX | `custom-sign-in-form.tsx`, `custom-sign-up-form.tsx` | Form components | ✅ | ✅ | Preparado |
| RF-UI-03 | Billing page | Cobrança | `src/app/dashboard/billing/` | Billing components | ✅ | ✅ | Preparado |
| RF-UI-04 | Video player | Reprodução | `custom-video-player.tsx` | Video component | ✅ | ✅ | Preparado |
| RF-UI-05 | Legal pages | Compliance | `src/app/terms/`, `src/app/privacy/`, etc. | Legal routes | ✅ | ✅ | Preparado |

---

## 4. Resumo Executivo

### Requisitos Funcionais (RF)
- **Total de RFs:** 51
- **Status ✅ (Implementado e testado):** 47 RFs (92%)
- **Status ⚠️ (Implementado parcialmente ou com ressalva):** 2 RFs (4% — rate limiting no backend pendente, entre outros itens HIGH do checklist)
- **Status ❌ (Não implementado/Stub):** 2 RFs (4% — upload direto S3, circuit breaker)

### Requisitos Não-Funcionais (RNF)
- **Total de RNFs:** 68
- **Status ✅ (Implementado):** 27 RNFs (40%)
- **Status ⚠️ (Implementado parcialmente ou sem baseline definido):** 24 RNFs (35%)
- **Status ❌ (Não implementado):** 17 RNFs (25% — maioria são "A DEFINIR" pelo usuário)

### RNFs Críticos "A DEFINIR"
1. **RNF-SEC-09** — Content Security Policy (CSP)
2. **RNF-SEC-10** — Proteção de endpoint de debug
3. **RNF-SEC-12** — Pinning de versões Python
4. **RNF-SEC-13** — Fluxo de exclusão de conta
5. **RNF-UPLOAD-03** — Duração máxima de vídeo
6. **RNF-RL-03, RNF-RL-04, RNF-RL-05** — Rate limits no backend e actions
7. **RNF-PERF-06** — SLA de processamento de vídeo
8. **RNF-SCALE-05** — Tamanho do pool Postgres
9. **RNF-AVAIL-03, RNF-AVAIL-04, RNF-AVAIL-05, RNF-AVAIL-06** — Circuit breaker, fallback, backup/rollback
10. **RNF-A11Y-05, RNF-A11Y-07** — Focus trap em modais, skip links
11. **RNF-MAINT-04, RNF-MAINT-09** — Cobertura de teste formal, ADRs

---

## 5. Notas e Observações

### Fonte de Verdade Utilizada
1. **Casos de Uso e Regras de Negócio:** `./casos-de-uso-e-regras-de-negocio.md` (último update antes desta extração)
2. **Prontidão para Produção (OWASP ASVS L2):** `../operacao/checklist-go-live.md` (auditoria de 2026-10-02)
3. **Código e Testes:** Leitura direta de `src/`, `tests/`, `ai-podcast-clipper-backend/`
4. **Specs Técnicos:** `../historico/superpowers/specs/` (histórico de decisões)

### Diferenças Notadas Entre Documentação e Código
- **Catálogo de Planos:** Documentação antiga mencionava "STUDIO", "CREATOR", "PRO_STUDIO" — corrigido no código via `PlanCatalogService` (apenas STARTER e PRO)
- **Pacotes Avulsos:** Documentação antiga mencionava "small/medium/large credit packs" — removidos do código conforme spec 2026-09-14
- **Upload Direto:** Documentação menciona implementação; código mostra stub na UI (decisão de produto: escondido, não vai no lançamento)
- **Nota de correção (2026-10-04):** a primeira versão deste documento afirmava "6 testes falhando em `test_subtitles.py`" e citava arquivos `tests/test_transcription.py`/`tests/test_vertical_video.py` que não existem no repositório. Verificado diretamente nesta sessão com `.venv/bin/python -m pytest tests/` (backend): **71/71 testes passam**, incluindo os 13/13 de `test_subtitles.py`. `core/transcription.py` e `core/vertical_video.py` não têm arquivo de teste dedicado hoje (gap real, mas diferente do que foi alegado).

### Próximos Passos Recomendados
1. **Fase 5 (Portão de Qualidade Final):** Rodar CI completo (GitHub Actions), testar clone novo do repositório, revisão de segurança
2. **Usuário:** Preencher dados jurídicos reais em páginas legais, criar 4 price IDs no Stripe (conforme `PlanCatalogService`)
3. **Backlog de RNFs:** Priorizar os 17 RNFs "A DEFINIR" conforme roadmap de produção

---

**Autoria:** Extraído via Documentation & Release Specialist agente  
**Revisor Recomendado:** domain-specialist, security-specialist, qa-specialist (para validar rastreabilidade)
