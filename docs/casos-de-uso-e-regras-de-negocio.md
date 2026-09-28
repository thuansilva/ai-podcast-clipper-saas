# Casos de Uso, Regras de Negócio e Status de Implementação

Catálogo consolidado do que o **AI Podcast Clipper** faz hoje, regra por
regra, com o status real de implementação e de teste — para responder "isso
já foi feito?" sem precisar ler todo o código toda vez.

> **Como manter isso atualizado**: ao implementar ou alterar uma regra de
> negócio, atualize a linha correspondente nesta tabela na mesma tarefa (o
> `AGENTS.md` já exige TDD para toda mudança — atualizar este catálogo é
> parte de "pronto", junto com o teste).
>
> **Relação com `docs/superpowers/specs/`**: aquela pasta tem o *design*
> detalhado de cada feature no momento em que foi planejada (14 documentos,
> um por feature). Este arquivo é o *estado atual consolidado* — quando
> divergirem, este arquivo reflete o código como ele está agora.

Legenda de status: ✅ Implementado e testado · ⚠️ Implementado parcialmente/com
ressalva · ❌ Não implementado (stub ou ausente)

---

## 1. Autenticação e Sessão

| Regra de negócio | Onde | Status |
|---|---|---|
| Login/cadastro via Clerk (email+senha, social) | `src/infrastructure/auth/clerk-auth.gateway.ts`, `src/middleware.ts` | ✅ |
| Toda server action/rota sensível exige sessão válida antes de agir | Todas as actions em `src/actions/*`, rota `/api/local-storage` | ✅ (ver `docs/owasp-asvs-l2-checklist.md` para o detalhe de que o *middleware* só cobre `/dashboard`, não `/api/**` — cada handler se protege individualmente) |
| Sincronização de usuário Clerk → banco local (`User`) | `SyncUserUseCase` (`src/application/use-cases/users/sync-user.use-case.ts`) | ✅ testado (`tests/unit/application/users/sync-user.use-case.test.ts`) |
| Webhook do Clerk idempotente/verificado | `src/app/api/webhooks/clerk/route.ts` | ✅ |

Spec detalhado: `docs/superpowers/specs/2026-09-12-clerk-auth-clean-architecture-design.md`.

---

## 2. Créditos e Cobrança

Modelo: créditos de **assinatura** (mensal/anual), **avulsos** (pacotes
one-time) e **reservados** (hold durante processamento). Ciclo de vida de um
processamento: **hold → consume (sucesso) ou refund (falha definitiva)**.

| Regra de negócio | Onde | Status |
|---|---|---|
| RN-01: cálculo de custo em créditos = `ceil(duração em minutos)`, mínimo 1 | `src/domain/services/credit-pricing.service.ts` | ✅ testado |
| Reserva (hold) de créditos antes de enfileirar processamento | `HoldCreditsUseCase` | ✅ testado |
| Débito definitivo (consume) ao concluir processamento com sucesso | `ConsumeCreditsUseCase`, chamado em `src/inngest/functions.ts:329` | ✅ testado |
| Estorno (refund) quando o job falha definitivamente (esgota retries do Inngest) | `RefundCreditsUseCase`, chamado no `onFailure` de `processVideo` (`src/inngest/functions.ts:413-452`) | ✅ testado — **este item já estava implementado**, calcula `min(creditsCost, reservedCredits)` e só estorna o que de fato foi reservado |
| Checkout de assinatura/pacote via Stripe | `ProcessSubscriptionCheckoutUseCase`, `src/actions/stripe.ts` | ✅ testado |
| Renovação de assinatura (créditos do novo ciclo) | `ProcessSubscriptionRenewalUseCase` | ✅ testado |
| Expiração de assinatura (fim do ciclo sem renovação) | `ExpireSubscriptionUseCase` | ✅ testado |
| Créditos avulsos creditados via webhook Stripe | `AddCreditsFromStripeUseCase` | ✅ testado |
| Idempotência de evento de webhook Stripe (não duplicar crédito em reentrega) | `ProcessedWebhookEvent` + `PrismaProcessedEventRepository` | ✅ testado (ver histórico — commit `ea70bde`) |
| Dados de cobrança do usuário (créditos disponíveis, plano atual) | `GetUserBillingDataUseCase` | ✅ testado |

Specs: `docs/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`.

---

## 3. Ingestão de Vídeo

| Regra de negócio | Onde | Status |
|---|---|---|
| Import por URL do YouTube: valida host, extrai vídeo ID, persiste `canonicalUrl` (não a URL crua) | `ImportYouTubeVideoUseCase`, `YouTubeUrl` (value object) | ✅ testado, corrigido nesta sessão (persistia URL crua — risco de SSRF) |
| Validação de host de novo no backend antes de baixar (defesa em profundidade) | `core/youtube_downloader.py::_assert_youtube_host` | ✅ testado |
| Enfileiramento automático de processamento ao importar do YouTube | `ImportYouTubeVideoUseCase` → `IQueueGateway.sendProcessVideoEvent` | ✅ |
| Rate limit de importações por usuário (5/min) | `importYouTubeVideo` action + `InMemorySlidingWindowRateLimiter` | ✅ testado |
| Geração de presigned URL para upload direto de arquivo | `GenerateUploadUrlUseCase`, `generateUploadUrl` action | ✅ testado |
| Upload restrito a vídeo (mimetype) e a um tamanho máximo (2GB) | `generateUploadUrlSchema` (`src/domain/schemas/generate-upload-url.schema.ts`) | ✅ testado — **adicionado nesta sessão**; no S3 o limite é reforçado via `ContentLength` assinado na URL, no storage local via corte do stream em `/api/local-storage` |
| Rate limit de geração de upload URL (10/min) | `generateUploadUrl` action | ✅ testado |
| **Upload direto do arquivo pelo browser até o S3 (depois de obter a presigned URL)** | `src/components/dashboard/create-project-client.tsx::handleUpload` | ❌ **stub** — só mostra um toast ("Upload para S3 será implementado em breve") e não envia bytes nenhum. Hoje o **único fluxo de ingestão que funciona de ponta a ponta é o import por URL do YouTube** |

Specs: `docs/superpowers/specs/2026-09-15-dynamic-video-options-design.md`.

---

## 4. Pipeline de Processamento (GPU)

Executado no backend Python (`ai-podcast-clipper-backend/`), via Modal
(`main.py`, produção) ou servidor local (`local_server.py`, GPU própria).

| Regra de negócio | Onde | Status |
|---|---|---|
| Transcrição do áudio (WhisperX) | `main.py` / `local_server.py` | ✅ |
| Identificação de momentos "virais" via LLM (Gemini) | `main.py` | ✅ testado (`tests/test_gemini_schema.py`) |
| Detecção de falante ativo (LR-ASD) | `asd/` (clone externo, ver `AGENTS.md`) | ✅ (não coberto por testes próprios do backend — é uma dependência externa) |
| Corte/crop vertical acelerado por GPU (FFMPEGCV) | `main.py` / `local_server.py` | ✅ |
| Geração e queima de legendas (3 presets: HORMOZI, MINIMAL, NEON) | `core/subtitle_styles.py` | ⚠️ implementado, mas **6 testes de `test_subtitles.py` estão falhando hoje** — a assinatura de `get_preset_style` mudou e os testes não foram atualizados (achado nesta sessão, não corrigido — fora do escopo do que foi pedido) |
| Upload do clipe final para S3 | `main.py` / `local_server.py` | ✅ |
| Autenticação por Bearer token nos endpoints do backend | `main.py` (produção) e `local_server.py` (local) | ✅ — **`local_server.py` não tinha essa checagem até esta sessão**, corrigido |
| Cortes manuais por timestamp (usuário define os cortes em vez da IA escolher) | `ManualCutDTO`, modo `mode: "manual"` em `ImportYouTubeVideoUseCase`/`TriggerVideoProcessingUseCase` | ✅ testado |
| Retry automático de processamento falho | `src/actions/generation.ts` não expõe retry direto; `retry-project.use-case.ts` reprocessa um projeto existente | ✅ testado |
| Circuit breaker / timeout nas chamadas para Modal e Gemini | — | ❌ não implementado (item da Fase 2 do roadmap de resiliência, ainda em aberto) |
| Teste de carga/caos simulando falha do backend Modal | `load-tests/scenarios/` (k6) | ❌ não implementado — só há cenários de carga "caminho feliz" |

Specs: `docs/superpowers/specs/2026-09-18-local-gpu-processing-design.md`,
`docs/superpowers/specs/2026-09-13-manual-cuts-timestamp-design.md`.

---

## 5. Gerenciamento de Clipes

| Regra de negócio | Onde | Status |
|---|---|---|
| Listar clipes de um vídeo/usuário | `IClipRepository.findByUserId/findByUploadedFileId` | ✅ testado |
| Gerar URL de reprodução, só se o clipe pertencer ao usuário | `GetClipPlayUrlUseCase` (`Clip.isOwnedBy`) | ✅ testado |
| Editar título/preset de legenda/transcrição de um clipe, só se for o dono | `UpdateClipUseCase` | ✅ testado |
| Validação de shape do payload de edição (título, preset, transcriptWords) | `updateClipSchema` | ✅ testado — **adicionado nesta sessão** (antes aceitava `transcriptWords: unknown` sem validar) |
| Excluir clipe (registro + arquivo no storage), só se for o dono | `DeleteClipUseCase` | ✅ testado |

---

## 6. Gerenciamento de Projetos (Dashboard)

| Regra de negócio | Onde | Status |
|---|---|---|
| Listar vídeos/projetos do usuário, paginado, com busca | `ListUserVideosUseCase` | ✅ testado |
| Renomear projeto, só se for o dono | `RenameProjectUseCase` | ✅ testado |
| Excluir projeto (vídeo + clipes + arquivos no storage), só se for o dono | `DeleteProjectUseCase` | ✅ testado |
| Reprocessar (retry) um projeto existente | `RetryProjectUseCase` | ✅ testado |
| Disparar processamento de um vídeo já enviado, só se for o dono | `TriggerVideoProcessingUseCase` / `processVideo` action | ✅ testado — **corrigido nesta sessão**: não verificava dono nenhum (IDOR crítico — qualquer um que soubesse o `uploadedFileId` de outro usuário disparava o processamento dele) |

Specs: `docs/superpowers/specs/2026-09-17-meus-projetos-design.md`,
`docs/superpowers/specs/2026-09-23-project-management-design.md`.

---

## 7. Segurança transversal (detalhe → ver checklist dedicado)

Autenticação, autorização/IDOR, validação de entrada, rate limiting, path
traversal e headers HTTP têm seu próprio rastreamento detalhado, item a item,
em **`docs/owasp-asvs-l2-checklist.md`** — não duplicado aqui para não
divergir.

---

## Resumo: o que está claramente incompleto hoje

1. **Upload direto de arquivo** — só a importação por URL do YouTube funciona ponta a ponta; o upload direto é um stub na UI (seção 3).
2. **Legendas** — 6 testes de estilo de legenda quebrados por uma mudança de assinatura não propagada (seção 4).
3. **Resiliência** — sem circuit breaker para Modal/Gemini, sem teste de carga simulando falha de GPU (seção 4; Fase 2 do roadmap original).
4. **SRE/observabilidade** — sem Sentry/logging estruturado, sem SLI/SLO definidos, sem pipeline de CD (Fase 3 do roadmap original — não coberto por este catálogo de regras de negócio, é infraestrutura).
