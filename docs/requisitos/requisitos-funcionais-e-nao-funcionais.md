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
| RF-AUTH-05 | Exclusão de conta (direito ao esquecimento, RNF-DATA-05): botão na UI pede ao Clerk para deletar o usuário; o webhook `user.deleted` apaga vídeos/clipes (S3+banco), cancela a assinatura na Stripe e anonimiza o cadastro (nunca remove a linha do `User`) | RN: Compliance / Limpeza de dados | `src/application/use-cases/users/delete-user-account.use-case.ts`, `src/app/api/webhooks/clerk/route.ts`, `src/actions/delete-account.ts`, `src/components/dashboard/delete-account-section.tsx` | ✅ | `tests/unit/application/users/delete-user-account.use-case.test.ts`, `tests/integration/clerk-webhook-account-deletion.integration.test.ts` |

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
| RF-INGEST-02 | Validação redundante de host YouTube no backend antes de baixar (defesa em profundidade), nos dois runners (`main.py` e `local_server.py`, ambos via `download_youtube_to_s3`; host inválido → 400). Chave de destino restrita a `youtube/<uuid>/original.mp4` (RNF-SEC-18) | RN: Segurança SSRF nível 2 | `ai-podcast-clipper-backend/core/youtube_downloader.py::_assert_youtube_host`, `download_youtube_to_s3`; `core/schemas.py::DownloadYouTubeRequest`; `main.py::download_youtube`; `local_server.py::download_youtube` | ✅ | Backend: `tests/test_youtube_downloader.py::TestHostValidation`, `tests/test_download_youtube_hardening.py`, `tests/test_local_server.py::TestLocalDownloadYouTube` |
| RF-INGEST-03 | Enfileiramento automático de processamento ao importar YouTube | RN: Orquestração de jobs | `src/application/use-cases/videos/import-youtube-video.use-case.ts` → `IQueueGateway.sendProcessVideoEvent` | ✅ | Integração em `tests/integration/inngest-pipeline.test.ts` |
| RF-INGEST-04 | Rate limit de importações YouTube por usuário: 5 requisições/minuto | RN: Abuso | `importYouTubeVideo` action + `InMemorySlidingWindowRateLimiter` | ✅ | `tests/unit/infrastructure/rate-limiting/in-memory-sliding-window-rate-limiter.test.ts` |
| RF-INGEST-05 | Geração de presigned URL para upload direto de arquivo até S3 | RN: Upload seguro | `src/application/use-cases/videos/generate-upload-url.use-case.ts`, `generateUploadUrl` action | ✅ | `tests/unit/application/videos/generate-upload-url.use-case.test.ts` |
| RF-INGEST-06 | Validação de tipo de arquivo (apenas vídeo) e tamanho máximo (2GB) no schema | RN: Validação de entrada | `src/domain/schemas/generate-upload-url.schema.ts` | ✅ | Schema validado em `tests/unit/domain/schemas/generate-upload-url.schema.test.ts` |
| RF-INGEST-07 | Rate limit de geração de upload URL: 10 requisições/minuto | RN: Abuso | `generateUploadUrl` action | ✅ | Integração de rate limiting |
| RF-INGEST-08 | Upload direto de arquivo pelo browser até S3 (após obter presigned URL) | RN: Fluxo de ingestão | Não implementado | ❌ | **Stub/Escondido de propósito** — decisão de produto: fluxo não implementado na Fase 4. A função que era `handleUpload` foi removida de `src/components/dashboard/create-project-client.tsx` |
| RF-INGEST-09 | Preview de metadata de vídeo do YouTube (`GET /api/youtube/info`): exige sessão autenticada (401 sem Clerk session) e aplica rate limit de 20 requisições/minuto por usuário (429 acima do limite) | RN: Controle de acesso + Abuso | `src/app/api/youtube/info/route.ts`, `makeYouTubeInfoRateLimiter` em `src/infrastructure/factories/rate-limiter-factory.ts` | ✅ | `tests/unit/api/youtube-info-route.test.ts`, `tests/integration/api/youtube-info-route.integration.test.ts` |
| RF-INGEST-10 (2026-10-12, ponta do frontend concluída; correção de integridade do download 2026-10-12) | Download parcial no modo manual: `POST /download_youtube` aceita `manual_cuts` (mesmo shape de `ProcessVideoRequest.manual_cuts`); quando presente e não vazio, baixa só o(s) trecho(s) que cobrem os cortes (mesclados com margem de 2s, `merge_time_ranges`/`VIDEO_RANGE_MARGIN_SECONDS`) e concatena num único arquivo final em `s3_key` — nunca um arquivo por trecho. Sem `manual_cuts`, comportamento idêntico ao de antes (baixa o vídeo inteiro). A resposta inclui `remapped_ranges` (mapeamento dos trechos mesclados para o arquivo concatenado) e `remapped_cuts` (os próprios cortes, já com `new_start`/`new_end` no vídeo menor — calculado no backend, não no frontend, ver RN-PIPE-MANUAL-18). **Integridade do arquivo baixado:** o `format_spec` do yt-dlp restringe o formato de vídeo a protocolo HTTPS (`[protocol^=https]`), excluindo formatos HLS (`m3u8_native`) que, combinados com `download_ranges`, produziam silenciosamente um arquivo sem faixa de vídeo; além disso, antes do upload, `core/video_probe.py::has_video_stream` (ffprobe) confirma que o arquivo concatenado tem pelo menos uma faixa de vídeo — se não tiver, `YouTubeDownloaderError` explícito em vez de um arquivo quebrado seguir pro resto do pipeline (ver nota em `visao-fluxo-processamento-video.md`). **Frontend:** `downloadYouTubeVideo` (`src/inngest/functions.ts`) envia `event.data.manualCuts` como `manual_cuts` quando `mode="manual"` e devolve `remappedCuts`/`remappedRanges`; `processVideoHandler` guarda os cortes remapeados na reserva de créditos (`reservation.remappedManualCuts`) e os usa (em vez dos originais) ao montar `manual_cuts` do payload de `/process_video` no step `call-modal-gpu` — preservando `id`/`title` originais na mesma ordem. As validações de duração/cortes (`assertManualCutsWithinVideo`, `validateVideoDuration`, cálculo de créditos) continuam operando sobre os cortes e a duração **originais**, antes do remapeamento. Falha explícita (erro claro, sem fallback silencioso para os tempos originais) se o modo é manual num vídeo do YouTube e o backend não devolveu `remapped_cuts`. `UploadedFile.manualCutsJson` (cortes originais, usado pelo retry) nunca é sobrescrito com os valores remapeados | RN: Custo/armazenamento (RN-PIPE-MANUAL-18) | Backend: `core/youtube_downloader.py` (`download_youtube_to_s3` com `time_ranges`, `_download_time_ranges_to_s3`, `_concat_video_segments`, `remap_manual_cuts`), `core/video_probe.py` (`has_video_stream`), `core/time_ranges.py` (`merge_time_ranges`, `build_range_offsets`, `remap_cut_to_output`/`remap_cuts_to_output`), `core/schemas.py` (`DownloadYouTubeRequest.manual_cuts`, `RemappedTimeRange`, `RemappedManualCut`), `main.py::download_youtube`, `local_server.py::download_youtube`. Frontend: `src/inngest/functions.ts` (`downloadYouTubeVideo`, `processVideoHandler`) | ✅ | Backend: `tests/test_time_ranges.py`, `tests/test_youtube_downloader.py` (`TestDownloadYouTubeToS3WithTimeRanges`, `TestDownloadYouTubeToS3WithoutTimeRangesRegression`, `TestRemapManualCuts`, `TestDownloadYouTubeEndpoint::test_endpoint_passes_manual_cuts_as_time_ranges_and_returns_remapping`, `test_range_format_spec_excludes_hls_protocol`, `test_raises_explicit_error_when_downloaded_file_has_no_video_stream`), `tests/test_video_probe.py::TestHasVideoStream` (6 casos novos), `tests/test_local_server.py::TestLocalDownloadYouTube` (3 novos testes). Frontend: `tests/unit/inngest/download-youtube-request-body.test.ts` (+4 casos: envio de `manual_cuts`, omissão quando vazio, `remappedCuts`/`remappedRanges` presentes/ausentes), `tests/unit/inngest/youtube-manual-cuts-remap.test.ts` (6 casos novos: envio dos tempos originais ao download, uso dos tempos remapeados no `/process_video`, validação/cobrança sobre os originais, `manualCutsJson` preservado, falha explícita sem `remapped_cuts`, regressão do modo automático), `tests/integration/inngest-pipeline.test.ts` (Cenário 8 e 9, Postgres real) |

**Spec:** `../historico/superpowers/specs/2026-09-15-dynamic-video-options-design.md`

---

### 1.4. Pipeline de Processamento (PIPE)

| ID | Descrição | Origem | Artefato Principal | Status | Teste |
|---|---|---|---|---|---|
| RF-PIPE-01 | Transcrição automática do áudio (WhisperX) | RN: Processamento core | `ai-podcast-clipper-backend/core/transcription.py` | ✅ | Sem teste unitário dedicado — `core/transcription.py` não tem arquivo de teste próprio hoje (71/71 testes do backend passam, confirmado com `.venv/bin/python -m pytest tests/`, mas nenhum cobre esta função isoladamente) |
| RF-PIPE-02 | Identificação de momentos "virais" via LLM (Gemini 2.5 Pro) | RN: IA generativa | `ai-podcast-clipper-backend/main.py`, schema Gemini | ✅ | Backend: `tests/test_gemini_schema.py` |
| RF-PIPE-03 | Detecção de falante ativo (LR-ASD via submódulo `asd/`) | RN: Localização de speaker | `ai-podcast-clipper-backend/asd/` (clone externo) | ✅ | Dependência externa — não testada no escopo deste projeto |
| RF-PIPE-04 | Corte/crop vertical acelerado por GPU (FFMPEGCV) | RN: Renderização | `ai-podcast-clipper-backend/core/vertical_video.py` | ✅ | Sem teste unitário dedicado — `core/vertical_video.py` não tem arquivo de teste próprio hoje (71/71 testes do backend passam) |
| RF-PIPE-05 | Geração e queima de legendas. Presets da UI: HORMOZI, POPPING_GREEN, GAMER, LOUD, NEON, TRUE_CRIME, MINIMAL, CORPORATE, VLOG, ASMR, NONE. Alias legado aceito: CLEAN. Qualquer valor fora dessa allowlist recebe 422 (RNF-SEC-16) | RN: Subtitles | `ai-podcast-clipper-backend/core/subtitle_styles.py` (`SUPPORTED_PRESETS`), `core/subtitles.py` (ffmpeg via lista de argumentos, `shell=False`), `core/schemas.py` (`SubtitlePreset`, `SUBTITLE_PRESETS`). Frontend: `src/domain/schemas/process-video.schema.ts`, `src/domain/schemas/import-youtube-video.schema.ts` (`z.enum(PROJECT_SUBTITLE_PRESETS)`) | ⚠️ | Backend: `tests/test_subtitles.py` (13 passed), `tests/test_preset_shell_injection.py`, `tests/test_local_server.py::test_shell_metachar_preset_returns_422_before_pipeline`. Frontend: `tests/unit/domain/schemas/process-video.schema.test.ts`, `tests/unit/domain/schemas/import-youtube-video.schema.test.ts`. **Gap aberto:** preset `NONE` ("Sem Legenda" na UI) é aceito pelo contrato mas não tem implementação no backend — `get_preset_style` cai para HORMOZI (ver checklist, pendências de segurança 2026-10-09) |
| RF-PIPE-06 | Upload do clipe final para S3 em pasta `clips/` | RN: Armazenamento seguro | `ai-podcast-clipper-backend/core/clip_pipeline.py` (linhas 100-101), `core/s3_paths.py` | ✅ | Backend: `tests/test_s3_paths.py` |
| RF-PIPE-07 | Autenticação via Bearer token em endpoints do backend | RN: Segurança | `ai-podcast-clipper-backend/main.py:112-117,149-154` (validação em `process_video` e `download_youtube`), `local_server.py` | ✅ | Verificação em `tests/test_local_server.py` |
| RF-PIPE-08 | Cortes manuais por timestamp (usuário define cortes em vez de IA; `mode: "manual"` pula a identificação via Gemini e processa exatamente os cortes enviados) | RN: Customização | Backend: `core/schemas.py` (`ManualCut`, `ProcessVideoRequest`, `MAX_MANUAL_CUT_TITLE_LENGTH`), `core/video_probe.py`, `core/video_pipeline.py`, `core/clip_pipeline.py`, `main.py`, `local_server.py`. Frontend: `src/application/services/process-video-payload.service.ts`, `src/inngest/functions.ts` (guards `ManualCutsRequiredError` e `ManualCutsModeMismatchError`, antes do hold), `src/application/use-cases/retry-project.use-case.ts`, `src/domain/schemas/manual-cut.schema.ts`, `src/domain/errors/manual-cuts-required-error.ts`, `src/domain/errors/manual-cuts-mode-mismatch-error.ts` | ✅ | Backend: `tests/test_process_video_contract.py`, `tests/test_video_probe.py`, `tests/test_video_pipeline.py`, `tests/test_clip_pipeline.py`, `tests/test_local_server.py`, `tests/test_main_process_video.py`, `tests/test_manual_cut_input_hardening.py` (NaN/Infinity, título > 200). Frontend: `tests/unit/application/services/process-video-payload.service.test.ts`, `tests/unit/application/retry-project.use-case.test.ts`, `tests/unit/domain/schemas/manual-cut.schema.test.ts`, `tests/unit/inngest/manual-cuts-pipeline.test.ts`, `tests/unit/inngest/manual-cuts-billing-consistency.test.ts`, `tests/integration/inngest-pipeline.test.ts`, `tests/integration/process-video-contract.integration.test.ts`, `tests/integration/manual-cuts-billing-consistency.integration.test.ts`. **Transcrição só dos cortes (2026-10-11, RN-PIPE-MANUAL-08):** no modo manual o backend transcreve apenas o áudio dos cortes (`WhisperTranscriber.transcribe_range` + `merge_time_ranges` em `core/transcription.py`, orquestrado em `core/video_pipeline.py`), com margem de 0,5s e mesclagem de intervalos sobrepostos; testes: `tests/test_transcription_ranges.py`, `tests/test_video_pipeline.py` (`TestManualMode`, `TestAutoModeRegression`), `tests/test_local_server.py::test_manual_mode_transcribes_only_the_cut_ranges`. Regras: `RN-PIPE-MANUAL-01` a `15` em `casos-de-uso-e-regras-de-negocio.md`. Ressalvas conhecidas (ver checklist): `aspect_ratio`/`auto_zoom`/`genre` sem efeito; schemas Zod ainda aceitam `mode: "auto"` com cortes (o guard do Inngest rejeita antes do hold, mas a borda não); retry de projeto importado do YouTube com cortes reprocessa em automático **para projetos criados antes de 2026-10-11** (a importação passou a persistir `manualCutsJson`); handler 422 de `main.py` sem teste direto. **UI (2026-10-11):** o fluxo de criação via YouTube (`src/components/dashboard/create-project-client.tsx`) tem seletor Automático/Manual e editor de cortes (`mm:ss`/`h:mm:ss`, validação por linha, aviso de sobreposição, limite de 50, custo por `calculateManualCutsCredits`), usando `src/lib/time-format.ts` e `src/lib/manual-cut-rows.ts`; testes: `tests/unit/lib/time-format.test.ts`, `tests/unit/lib/manual-cut-rows.test.ts`, `tests/unit/components/create-project-client.test.tsx` (bloco "modo manual de cortes"), `tests/integration/actions/youtube-actions.integration.test.ts`. **Sliders (2026-10-11):** o Fatiador do modo automático passou a trabalhar em segundos (0 até a duração real, passo 1s, trecho mínimo 1s, custo por `calculateVideoCredits` sobre o trecho; antes era em minutos inteiros) e cada corte manual tem um slider de dois pontos sincronizado com os campos de texto (limite de 60s ao arrastar via `MAX_MANUAL_CUT_DURATION_SECONDS`), com regras puras em `src/lib/cut-slider.ts` e `thumbLabels`/`thumbValueText` em `src/components/ui/slider.tsx`; testes: `tests/unit/lib/cut-slider.test.ts`, `tests/unit/components/ui/slider.test.tsx` (Radix real: nome, `aria-valuetext`, setas de 1s), `tests/unit/components/create-project-client.test.tsx` (blocos "Fatiador com precisão de segundos" e "cortes manuais com slider sincronizado"), `tests/integration/actions/youtube-actions.integration.test.ts` (trecho em segundos não múltiplos de 60). **Rótulo "Corte Manual" (2026-10-11):** clipes de projeto manual mostram "Corte Manual" no lugar da porcentagem de viralização (card e modal de detalhes; o modal omite "Por que é viral?"). Regra pura `isManualCut` em `src/domain/services/clip-origin.service.ts` (`UploadedFile.manualCutsJson != null`, com fallback legado para clipe sem nota/gancho/motivo); `ImportYouTubeVideoUseCase` passou a persistir `manualCutsJson` (JSON string, como `TriggerVideoProcessingUseCase`) via `CreateUploadedFileInput.manualCutsJson`; UI em `src/components/clip-card.tsx`, `src/components/clip-details-modal.tsx`, `src/app/dashboard/projects/[id]/page.tsx`; testes: `tests/unit/domain/services/clip-origin.service.test.ts`, `tests/unit/clip-card-manual.test.tsx`, `tests/unit/components/clip-details-modal-manual.test.tsx`, `tests/unit/app/dashboard/project-details-page.test.tsx`, `tests/unit/application/videos/import-youtube-video.use-case.test.ts`, `tests/integration/clip-origin-manual-cuts.integration.test.ts` (Postgres real). **Limitações da UI:** (a) não há seletor no modo edição/retry (`editMode`); (b) _(atualizado 2026-10-11)_ no modo manual, o limite do plano (2h/3h) e a reserva de créditos usam a soma das durações dos cortes (RN-PIPE-MANUAL-16), e corte além do fim do vídeo falha antes do hold (RN-PIPE-MANUAL-17); detalhes em RF-PIPE-14. |
| RF-PIPE-09 | Retry automático de processamento falho (com limite de tentativas do Inngest) | RN: Resiliência | `src/actions/generation.ts`, `src/application/use-cases/retry-project.use-case.ts` | ✅ | `tests/unit/application/retry-project.use-case.test.ts` |
| RF-PIPE-10 | Circuit breaker/timeout nas chamadas Modal e Gemini | RN: Resiliência avançada | — | ❌ | **Pendente — Fase 2 do roadmap de resiliência** |
| RF-PIPE-11 | Consolidação de lógica entre Modal (`main.py`) e servidor local (`local_server.py`) em módulos compartilhados (`core/`) | RN: Manutenibilidade | `ai-podcast-clipper-backend/core/`, `local_server.py` como wrapper fino | ✅ | Backend: `tests/` validam módulos shared |
| RF-PIPE-12 | Armazenamento de objetos plugável: o pipeline de vídeo lê/grava através da porta `ObjectStorage` (`core/storage/ports.py`), com adapters AWS S3 real, S3-compatível (MinIO via `S3_ENDPOINT_URL`, path-style) e sistema de arquivos local (`STORAGE_PROVIDER=local`). Bucket sempre vem da config central, nunca do request. Frontend: mesma seleção via `STORAGE_PROVIDER`/`S3_ENDPOINT_URL` | RN: Armazenamento / Portabilidade de ambiente | Backend: `core/storage/ports.py`, `core/storage/s3_object_storage.py`, `core/storage/local_object_storage.py`, `core/storage/factory.py` (`create_object_storage`), injetado em `core/video_pipeline.py`, `core/clip_pipeline.py`, `core/youtube_downloader.py`, `main.py`, `local_server.py`. Frontend: `src/infrastructure/factories/storage-gateway.factory.ts` (`createStorageGateway`), `src/infrastructure/storage/s3-storage.gateway.ts`, `src/infrastructure/storage/storage-endpoint-guard.ts` | ✅ | Backend: `tests/test_storage_factory.py`, `tests/test_s3_object_storage.py`, `tests/test_local_object_storage.py` (unitários, 29 casos passados junto com `test_minio_object_storage.py`); `tests/test_minio_object_storage.py` (marker `minio`, 3 testes, skip gracioso em `localhost:9000` indisponível); `tests/test_youtube_downloader.py`. Frontend unitário: `tests/unit/infrastructure/factories/storage-gateway.factory.test.ts`, `tests/unit/infrastructure/storage/s3-storage.gateway.config.test.ts`, `tests/unit/infrastructure/storage/s3-storage.gateway.presign.test.ts`, `tests/unit/infrastructure/storage/storage-endpoint-guard.test.ts`. Frontend integração: `tests/integration/storage/s3-storage.minio.integration.test.ts` (skip gracioso se MinIO indisponível, mesmo padrão do backend — decisão revisada em 2026-10-12), `tests/integration/storage/storage-gateway.factory.production-guard.integration.test.ts` |
| RF-PIPE-13 | Provedor de IA plugável para identificação de momentos virais: o pipeline depende da porta `MomentsProvider` (`core/moments_port.py`), com adapters Gemini (default) e Claude (Anthropic, tool-use forçado), selecionados por `MOMENTS_PROVIDER` (`gemini`/`claude`). Valor desconhecido levanta erro (sem fallback silencioso). A troca é manual, por configuração, sem failover automático. No modo manual (RF-PIPE-08) nenhum provedor é chamado | RN: Resiliência a indisponibilidade de provedor de IA / Portabilidade | Backend: `core/moments_port.py` (`MomentsProvider`), `core/moments.py` (`identify_moments`, `GeminiMomentsProvider`), `core/claude_moments.py` (`identify_moments`, `ClaudeMomentsProvider`), `core/moments_factory.py` (`create_moments_provider`), injetado em `core/video_pipeline.py::run_video_processing_pipeline` e criado em `load_model()` de `main.py` e `local_server.py` | ✅ | Backend: `tests/test_moments_factory.py`, `tests/test_claude_moments.py`, `tests/moments_fakes.py` (fake de `MomentsProvider`), `tests/test_video_pipeline.py` (`TestMomentsProviderInjection`), `tests/test_local_server.py`. `test_moments_factory.py`, `test_claude_moments.py` e `test_video_pipeline.py` passam juntos (36 passed em 2026-10-11). **Ressalva:** o adapter Claude só é testado com cliente mockado, sem chamada à API real (ver checklist) |
| RF-PIPE-14 | No modo manual, o limite de duração do plano e a reserva de créditos usam a soma das durações dos cortes (não o vídeo inteiro); corte com fim além da duração do vídeo é rejeitado no Inngest antes do hold | RN-PIPE-MANUAL-16, RN-PIPE-MANUAL-17 | `src/domain/services/processing-duration.service.ts`, `src/domain/errors/manual-cut-beyond-video-error.ts`, `src/inngest/functions.ts::processVideoHandler` | ✅ | `tests/unit/domain/services/processing-duration.service.test.ts`, `tests/unit/inngest/manual-cuts-billing-consistency.test.ts` (bloco "duração efetiva no modo manual"), `tests/unit/inngest/manual-cuts-pipeline.test.ts`, `tests/integration/manual-cuts-billing-consistency.integration.test.ts`. **Limitação:** o vídeo inteiro ainda é baixado e guardado (download só dos trechos é etapa futura) |
| RF-PIPE-15 | Cada clipe devolvido por `/process_video` (Modal e local, modos automático e manual) inclui `words`: lista de `{word, start, end}` com as palavras da transcrição que entram no clipe, com tempos **relativos ao início do clipe** (o vídeo do clipe começa em 0; limitados a `[0, duração]`), mesmo critério de seleção das legendas queimadas (`generate_ass_subtitles`: sobreposição com o intervalo do clipe, chave `word`/`text`, itens sem tempo ou em branco ignorados). Clipe sem fala devolve `[]`. O Inngest grava `words` em `Clip.transcriptWords`. Bug corrigido (2026-10-11): `process_clip` não devolvia palavras, então `transcriptWords` ficava `null` nos dois modos desde antes dessa sessão | RN: Transcrição por clipe | Backend: `core/clip_pipeline.py` (`extract_clip_words`, `process_clip`). Frontend (já existente, não alterado): `src/inngest/functions.ts` (`clip.words ?? ...` → `transcriptWords`), `src/components/clip-editor-modal.tsx` (`parseTranscriptWords`), `src/components/clip-details-modal.tsx` | ✅ | Backend: `tests/test_clip_pipeline.py::TestClipWords`, `tests/test_local_server.py` (`test_each_manual_clip_response_carries_its_clip_relative_words`, `test_automatic_clip_response_carries_its_clip_relative_words`). Frontend: `tests/integration/inngest-pipeline.test.ts` (só assere `transcriptWords` definido, não o conteúdo) |

**Specs:** 
- `../historico/superpowers/specs/2026-09-18-local-gpu-processing-design.md`
- `../historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md` (contrato v2 atual; supersede as regras de duração do spec de 2026-09-13)
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
| RNF-SEC-04 | Verificação de assinatura em webhooks (Clerk, Stripe, Inngest) | ASVS V6: Crypto | Implementação em rotas `/api/webhooks/*` e `/api/inngest` | ✅ | **HMAC-SHA256 (Stripe) ✅**, **HMAC-SHA256 via Svix (Clerk) ✅**, **Inngest ✅ (2026-10-11):** `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` e `INNGEST_DEV` declaradas no schema de `src/env.js` (opcionais em dev/test) + validação cruzada `src/inngest-env-guard.js::assertInngestProductionEnv`, chamada por `src/env.js` logo após o `createEnv`: com `NODE_ENV=production`, key ausente/vazia ou `INNGEST_DEV` "verdadeiro" (dev mode do SDK desliga a verificação de assinatura) → erro no `next build`/boot (respeita `SKIP_ENV_VALIDATION`, como o resto do schema). O SDK `inngest` 4.20 em cloud mode já rejeita requisição sem assinatura válida (401) e sem signing key (500, sem executar função) — coberto como regression guard. **Testes:** `tests/unit/config/inngest-env-validation.test.ts` (função pura + import real de `~/env`), `tests/integration/inngest-serve-signature.integration.test.ts` (route handler real de `/api/inngest`: 500 sem key, 401 sem header, 401 com assinatura forjada, controle dev mode) |
| RNF-SEC-05 | Idempotência de webhooks (verificação de `ProcessedWebhookEvent` + race condition corrigida) | ASVS V6: Crypto | checklist-go-live.md, RN-08 de Créditos | ✅ | `event.id` como chave de deduplicação, `await dispatch` antes de marcar processado |
| RNF-SEC-06 | Proteção contra SSRF: validação de host YouTube no frontend + backend | ASVS V4: Access Control | RF-INGEST-01, RF-INGEST-02 | ✅ | **Frontend ✅**, **Backend Modal ✅**, **Backend local_server.py ✅ (2026-10-11).** `local_server.py::download_youtube` deixou de chamar `yt_dlp` via `subprocess` sem validar o host e de devolver caminho em `/tmp`. Agora usa a mesma função de produção, `core/youtube_downloader.py::download_youtube_to_s3` (valida via `_assert_youtube_host` antes do yt-dlp), com o storage plugável `create_object_storage()`. Host fora de `youtube.com`/`youtu.be` → **400** nos dois runners (`YouTubeInvalidHostError`; antes `main.py` devolvia 500). **Teste:** `tests/test_local_server.py::TestLocalDownloadYouTube::test_non_youtube_host_is_rejected_without_invoking_yt_dlp` (4 URLs, incl. `169.254.169.254`; nem `yt_dlp.YoutubeDL` nem `subprocess.run` chamados), `tests/test_download_youtube_hardening.py::TestMainDownloadYouTubeHttp::test_non_youtube_host_returns_400_without_invoking_yt_dlp`, `tests/test_youtube_downloader.py::TestHostValidation` |
| RNF-SEC-07 | Autenticação de API do backend (Bearer token em `/process_video`, `/download_youtube`) | ASVS V3: Session Management | RF-PIPE-07 | ✅ | **Corrigido (2026-10-09):** comparação via `hmac.compare_digest` sobre bytes em `local_server.py::verify_auth_token`, `main.py::process_video` e `main.py::download_youtube` (antes: `!=`, timing side-channel). `AUTH_TOKEN` ausente/vazio ou bearer vazio → 401 explícito. Defesa em profundidade: via HTTP o `HTTPBearer` do FastAPI já rejeita bearer vazio com 401, e a comparação antiga já rejeitava `AUTH_TOKEN` vazio com bearer não vazio, então não havia fail-open alcançável pela rede. Bearer não-ASCII → 401 (guarda contra regressão: `compare_digest` com `str` não-ASCII lança `TypeError`). **Teste:** `ai-podcast-clipper-backend/tests/test_auth_token_constant_time.py` (15 passed: 5 cenários × 3 pontos de entrada, incluindo espião em `hmac.compare_digest`). Suíte backend completa: 192 passed. |
| RNF-SEC-08 | Rate limiting em ações sensíveis (importação YouTube, geração upload URL, actions de projeto/billing, endpoints backend) | ASVS V11: Business Logic | RF-INGEST-04, RF-INGEST-07, RNF-RL-* | ⚠️ | **Implementado no frontend** para import YouTube, upload URL, preview de metadata, actions de projeto (delete/rename/retry — RNF-RL-04) e billing (checkout/portal — RNF-RL-05, resolvidos em 2026-10-11); **estado compartilhado entre instâncias via Upstash Redis quando configurado (RNF-RL-06, 2026-10-12)**, com fallback automático para in-memory sem credenciais; **backend ainda sem rate limiting por requisição (RNF-RL-03)** |
| RNF-SEC-09 | Content Security Policy (CSP) | ASVS V9/V13 | `next.config.js`, `content-security-policy.config.js` | ⚠️ | **Parcial (2026-10-11):** header `Content-Security-Policy-Report-Only` ativo em todas as rotas — reporta violações sem bloquear nada. Diretivas mínimas (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`) + exceções levantadas lendo o código: Clerk (`script-src`/`connect-src`/`frame-src` para `*.clerk.accounts.dev`, `img-src` para `img.clerk.com`), miniaturas do YouTube (`i.ytimg.com`), imagens da landing (`images.unsplash.com`), S3/MinIO em `media-src`/`img-src` (`*.amazonaws.com` + origem de `S3_ENDPOINT_URL` quando configurado). Nenhum domínio Stripe foi necessário — checkout/portal usam redirect de página inteira (`src/actions/stripe.ts`), não iframe/script embutido. **Pendente:** validar ao vivo em staging (login Clerk, checkout/portal Stripe, player de vídeo) e só então decidir promover para `Content-Security-Policy` (enforce) — decisão do usuário, não automática. Testes: `tests/unit/next-config.test.ts`, `tests/integration/security-headers-csp.integration.test.ts`. |
| RNF-SEC-10 | Endpoint de debug (`/api/dev-sign-stripe-payload`) não exposto em produção | ASVS V13: API | checklist-go-live.md | ✅ | **Resolvido (2026-10-11): endpoint REMOVIDO** (`src/app/api/dev-sign-stripe-payload/route.ts` deletado) — antes ele assinava qualquer payload com o `STRIPE_WEBHOOK_SECRET` real, sem auth, em todo ambiente com `NODE_ENV !== "production"` (forja de webhook Stripe em preview/staging). Substituto fora do app, só local/offline, para o experimento de observabilidade: `ai-podcast-clipper-frontend/scripts/sign-stripe-test-payload.js` (`stripe.webhooks.generateTestHeaderString`). **Teste:** `tests/integration/dev-sign-stripe-payload-removed.test.ts` (HTTP real, POST/GET → 404), `tests/unit/scripts/sign-stripe-test-payload.test.ts` (6 `it`) |
| RNF-SEC-01 | Autenticação obrigatória para todas as ações sensíveis | ASVS V2: Authentication | Middleware + per-action validation | ✅ | **Resolvido (2026-10-11):** `/api/youtube/info` agora exige sessão via `makeAuthGateway().getUserId()` (401 sem sessão) e aplica `makeYouTubeInfoRateLimiter()` (429 acima de 20 req/min por usuário) — ver RF-INGEST-09. Testes: `tests/unit/api/youtube-info-route.test.ts`, `tests/integration/api/youtube-info-route.integration.test.ts` |
| RNF-SEC-11 | Dependências npm sem vulnerabilidades críticas/high | ASVS V14: Dependencies | npm audit | ⚠️ | **1 critical remanescente em `fast-xml-parser` via AWS SDK v3** |
| RNF-SEC-12 | Dependências Python com versões pinadas (não ranges) | ASVS V14: Dependencies | `requirements.txt` | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-13 | Fluxo de exclusão de conta completo (UI + webhook Clerk cleanup S3/Stripe) | ASVS V2: Authentication | checklist-go-live.md | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-14 | Logging estruturado de tentativas de acesso negado (IDOR bloqueado, auth falha) | ASVS V7: Logging | checklist-go-live.md (NICE) | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-15 | Sanitização de PII em logs (Gemini responses, títulos de clip) | ASVS V7: Logging | checklist-go-live.md (NICE) | ❌ | Pendente — ação já definida no checklist-go-live.md |
| RNF-SEC-16 | Proteção contra injeção de comando e de argumentos em entradas do usuário: nenhum `subprocess` do fluxo de legenda usa shell; `preset` restrito a allowlist (422 fora dela) | ASVS V5: Validation | RF-PIPE-05, RF-PIPE-08, RN-PIPE-PRESET-01 | ⚠️ | **Corrigido no caminho de legendas** (`core/subtitles.py` com `shell=False` e lista de argumentos; allowlist `SubtitlePreset` no backend e `z.enum(PROJECT_SUBTITLE_PRESETS)` no frontend). **Auditado em 2026-10-09 (sem ação necessária):** 5 ocorrências de `subprocess.run(..., shell=True)` com string montada em `core/clip_pipeline.py` (2), `core/vertical_video.py`, `core/transcription.py`, `core/active_speaker_detection.py` — auditadas contra os demais campos do request (ex.: `s3_key`): **auditoria concluída (2026-10-09), sem ação necessária** — todos usam só valores internos (ver checklist). Ver checklist (pendências de segurança 2026-10-09). |
| RNF-SEC-18 | Chave de destino do download do YouTube restrita ao formato gerado pelo sistema: `DownloadYouTubeRequest.s3_key` só aceita `youtube/<uuid>/original.mp4` (qualquer outro valor → 422) e o contrato é `extra="forbid"` (campo desconhecido, inclusive o legado `s3_bucket`, → 422) | ASVS V5: Validation / V4: Access Control | RF-INGEST-02, RNF-SEC-06, checklist-go-live.md (Riscos de Segurança por Design) | ✅ | **Implementado (2026-10-11):** `core/schemas.py::DownloadYouTubeRequest` (`YOUTUBE_S3_KEY_PATTERN`, UUID canônico, `$` ancorado no fim real da string pelo engine Rust do Pydantic v2), compartilhado por `main.py` e `local_server.py`. Impede que um chamador com `AUTH_TOKEN` sobrescreva `clips/` de outro usuário ou use `../`/caminho absoluto. Frontend `src/inngest/functions.ts::downloadYouTubeVideo` envia só `url` + `s3_key`. **Residual:** o chamador ainda escolhe *qual* `youtube/<uuid>` (ver checklist). **Teste:** `tests/test_download_youtube_hardening.py` (schema + HTTP em `main.download_youtube`: 422 sem chamar `download_youtube_to_s3`), `tests/test_local_server.py::TestLocalDownloadYouTube::test_invalid_s3_key_returns_422_before_any_download` / `test_legacy_s3_bucket_field_returns_422`, frontend `tests/unit/inngest/download-youtube-request-body.test.ts` |
| RNF-SEC-17 | Endpoint S3-compatível de dev (`S3_ENDPOINT_URL`, ex.: MinIO em `localhost:9000`) nunca configurado em produção | ASVS V14: Configuration | RF-PIPE-12, `docs/operacao/minio-dev-local.md`, `docs/operacao/modal-secret-checklist.md`, `checklist-go-live.md` (Riscos de Configuração) | ✅ | **Frontend ✅:** `src/infrastructure/storage/storage-endpoint-guard.ts::assertStorageEndpointAllowed` (chamado por `storage-gateway.factory.ts::createStorageGateway`) falha alto com `NODE_ENV=production` para host `localhost`/loopback/privado/link-local/nome interno (`.local`, `.internal`, `.localhost`)/nome sem domínio, e para protocolo não-`https:`. Testes: `tests/unit/infrastructure/storage/storage-endpoint-guard.test.ts` (2 `it`), `tests/integration/storage/storage-gateway.factory.production-guard.integration.test.ts` (3 `it`: bloqueia `localhost`, aceita HTTPS público, MinIO liberado fora de produção). **Backend ✅ (2026-10-11):** `core/storage/factory.py::create_object_storage` agora valida `S3_ENDPOINT_URL` (branch `"minio"`) quando `APP_ENV="production"` (nova env var, introduzida especificamente para este guard — o backend não tem `NODE_ENV`; default `"development"`, comportamento de dev inalterado), rejeitando `localhost`/loopback/IP privado/link-local, nome interno (`.local`/`.internal`/`.localhost`), hostname sem domínio (ex.: `minio`) e esquema não-`https://`, mesma regra do guard do frontend. Testes: `tests/test_storage_factory.py::TestProductionEndpointGuard` (18 casos) e `TestProductionEndpointGuardIntegration` (1 caso, sem mock de `boto3.client`). |
| RNF-SEC-19 | `s3_key` de entrada do `/process_video` restrito aos formatos gerados pelo sistema; sem leitura de arquivo local: `ProcessVideoRequest.s3_key` só aceita `youtube/<uuid>/original.mp4` ou `uploads/<userId>/<uuid>/<nome>` (qualquer outro valor → 422) e o vídeo de entrada sempre vem do storage plugável | ASVS V5: Validation / V12: Files and Resources | RF-PIPE-12, RNF-SEC-18, checklist-go-live.md (Riscos de Segurança por Design → `resolve_input_video_path`) | ✅ | **Implementado (2026-10-11):** `core/video_pipeline.py::resolve_input_video_path` perdeu o ramo `os.path.exists(s3_key)` → `shutil.copy` (que permitia `s3_key="/etc/passwd"` para quem tinha `AUTH_TOKEN`) e sempre chama `storage.download_file`. `core/schemas.py::PROCESS_VIDEO_S3_KEY_PATTERN` reaproveita o padrão do YouTube (RNF-SEC-18) e acrescenta o formato de upload de `generate-upload-url.use-case.ts` (`userId` `[A-Za-z0-9_-]+`, UUID canônico, nome `[A-Za-z0-9._-]+` mas nunca `.`/`..`); `$` ancorado no fim real da string (`\n` no fim → 422). Vale para `main.py` e `local_server.py`, que usam o mesmo schema. **Residual:** o backend não confere se o `userId` da chave é o dono da requisição (o frontend é a única origem). **Teste:** `tests/test_process_video_s3_key_hardening.py` (schema + HTTP em `main.process_video`: 422 sem chamar o pipeline nem o storage), `tests/test_video_pipeline.py::TestResolveInputVideoPath`, `tests/test_local_server.py::TestLocalProcessVideoS3KeyHardening` |

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
| RNF-RL-03 | Rate limit em endpoints do backend (`/process_video`, `/download_youtube`) | Abuse Prevention | checklist-go-live.md (HIGH) | ⚠️ | **Parcial (2026-10-12):** `AiPodcastClipper` (`/process_video`) ganhou `max_containers=2` — teto de **custo de GPU em paralelo**, não throttling por requisição/usuário. `/download_youtube` sem teto (CPU, barato). Falta rate limit de verdade (slowapi/Limiter, ex. 10 req/min por token). **Teste:** `tests/test_modal_gpu_concurrency_cap.py` |
| RNF-RL-04 | Rate limit global em actions de projeto (delete, rename, retry) | Abuse Prevention | checklist-go-live.md (HIGH) | ✅ | **Resolvido (2026-10-11): 20 requisições / 60 segundos por usuário** — `makeProjectActionRateLimiter()` (`src/infrastructure/factories/rate-limiter-factory.ts`), aplicado em `deleteProjectAction`, `renameProjectAction` e `retryProjectAction` (`src/actions/projects-actions.ts`) logo após resolver `userId`, lançando `RateLimitExceededError` acima do limite. Testes: `tests/unit/actions/projects-actions-rate-limit.test.ts`, `tests/integration/actions/projects-actions-rate-limit.integration.test.ts` |
| RNF-RL-05 | Rate limit em ações de billing (checkout, portal session) | Abuse Prevention | checklist-go-live.md (HIGH) | ✅ | **Resolvido (2026-10-11): 5 requisições / 60 segundos por usuário** (limite compartilhado entre checkout e portal) — `makeBillingActionRateLimiter()` (`src/infrastructure/factories/rate-limiter-factory.ts`), aplicado em `createCheckoutSession` e `createCustomerPortalSession` (`src/actions/stripe.ts`) logo após resolver `userId`, lançando `RateLimitExceededError` acima do limite (evita loop de criação de sessões Stripe). Testes: `tests/unit/actions/stripe-actions-rate-limit.test.ts`, `tests/integration/actions/stripe-actions-rate-limit.integration.test.ts` |
| RNF-RL-06 | Rate limit com estado compartilhado entre instâncias/processos (serverless-safe), não apenas por instância | Abuse Prevention | checklist-go-live.md (HIGH, "Rate limiting in-memory não funciona em serverless") | ✅ | **Resolvido — implementação (2026-10-12); falta validação manual com conta Upstash real:** nova `UpstashRedisRateLimiter` (`src/infrastructure/rate-limiting/upstash-redis-rate-limiter.ts`) implementa `IRateLimiter` com fixed-window counter atômico (`INCR` + `PEXPIRE key ms NX` num único pipeline) sobre Upstash Redis (REST, sem conexão persistente). `rate-limiter-factory.ts` escolhe essa implementação para os 5 singletons (`makeUploadUrlRateLimiter`, `makeYouTubeImportRateLimiter`, `makeYouTubeInfoRateLimiter`, `makeProjectActionRateLimiter`, `makeBillingActionRateLimiter`) quando `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` estão configuradas; sem elas, cai para `InMemorySlidingWindowRateLimiter` (RNF-RL-01/02/04/05), sem lançar erro — nenhum call site mudou. Env vars opcionais em `src/env.js` e `.env.example`. **Testes:** `tests/unit/infrastructure/rate-limiting/upstash-redis-rate-limiter.test.ts` (5 casos), `tests/unit/infrastructure/factories/rate-limiter.factory.test.ts` (4 casos). **Pendência:** nunca testado contra uma conta Upstash real (sem credenciais disponíveis) — validação manual do usuário antes do go-live. |

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
| RNF-SCALE-06 | Índices de banco em FKs/colunas de filtro de alto volume (`UploadedFile.userId`, `Clip.userId`/`uploadedFileId`, `CreditTransaction.type`, `Subscription.status`) | Database | checklist-go-live.md ("Índices ausentes em FKs de alto volume") | ✅ | **Resolvido (2026-10-12):** migration `prisma/migrations/20261012194633_add_missing_fk_indexes` — `@@index([userId])` em `UploadedFile`/`Clip`, `@@index([uploadedFileId])` em `Clip`, `@@index([type])` em `CreditTransaction`, `@@index([status])` em `Subscription` (`CreditTransaction.userId` já tinha índice próprio; `Subscription.userId` já é `@unique`, que já cria índice implícito). **Verificação:** migration aplicada sem erro contra o Postgres local + `npm run test:integration` sem regressão (índice não muda resultado de query, só o plano de execução) |

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
| RNF-AVAIL-07 | Etapa de identificação de momentos não depende de um único provedor de LLM: provedor alternativo (Claude) selecionável por configuração (`MOMENTS_PROVIDER`), sem alteração de código, para contornar indisponibilidade do primário (ex.: `503 UNAVAILABLE` do Gemini) | Resilience | RF-PIPE-13 | ⚠️ | **Parcial (2026-10-11):** troca manual por env var e redeploy. Sem failover automático, sem retry/timeout por provedor (RNF-AVAIL-03 e RF-PIPE-10 seguem pendentes). Ver `../arquitetura/visao-fluxo-processamento-video.md`, seção "Identificação de Momentos" |

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
| RNF-IDEM-01 | Idempotência de webhooks Stripe (deduplicação via `ProcessedWebhookEvent`) | Webhooks | RF-BILL-08, RNF-SEC-05 | ✅ | event.id como chave única + transação BD. **Cobertura de teste ampliada (2026-10-12):** além dos testes que chamam a função `POST` do route handler direto em processo (`stripe-webhook-idempotency.integration.test.ts`), `tests/integration/stripe-webhook-real-http.integration.test.ts` bate via `fetch` real num servidor Next.js de pé (payload no formato completo do Stripe, assinado de verdade), incluindo um cenário de retry com o mesmo `event.id` via HTTP de ponta a ponta — ver checklist-go-live.md ("Webhook Stripe sem teste de integração real") |
| RNF-IDEM-02 | Idempotência de webhooks Clerk (verificação de assinatura + deduplicação) | Webhooks | RF-AUTH-04 | ✅ | **Corrigido (2026-10-12):** era acidental (duas entregas concorrentes de `user.created` podiam ambas ver `findById` retornar `null` antes de qualquer `create()` terminar; a segunda violava a PK e subia sem tratamento). `PrismaUserRepository.create()` traduz `P2002` em `UserAlreadyExistsError` (domínio); `SyncUserUseCase.execute()` captura esse erro, refaz o `findById` e segue o caminho de `update()` — idempotência deliberada. **Teste:** `tests/unit/application/users/sync-user.use-case.test.ts`, `tests/integration/clerk-webhook-idempotency.integration.test.ts` (Postgres real, constraint de unicidade de verdade) |
| RNF-IDEM-03 | Operações de crédito (hold/consume/refund) transacionais no Prisma | Transactions | AGENTS.md | ✅ | `PrismaUnitOfWork` garante atomicidade |
| RNF-IDEM-05 | Dispatch de eventos Stripe nunca usa a fila em memória (não durável) em produção | Durabilidade / Webhooks | RF-BILL-08, RNF-SEC-05, checklist-go-live.md | ✅ | **Implementado (2026-10-11):** `src/infrastructure/queue/stripe-queue.ts::assertInMemoryFallbackAllowed` — com `NODE_ENV=production` e sem `INNGEST_EVENT_KEY`, `enqueue`/`enqueueSubscription` lançam em vez de empurrar pra fila em memória; a rota do webhook responde 503 sem marcar o evento como processado (Stripe reentrega). Primeira camada: `src/env.js` (RNF-SEC-04). **Testes:** `tests/unit/infrastructure/queue/stripe-queue.production-guard.test.ts` (7 casos), `tests/integration/stripe-webhook-in-memory-queue-production-guard.integration.test.ts` (2 casos) |
| RNF-IDEM-06 | Falha do gateway de pagamento ao criar customer Stripe durante o sync de usuário não deve ser mascarada silenciosamente | Resilience / Observability | checklist-go-live.md ("Fallback silencioso de customer Stripe") | ✅ | **Corrigido (2026-10-12):** `SyncUserUseCase.execute()` usava `console.warn` + `cus_fallback_${Date.now()}` sem nenhum sinal recuperável. Agora: sentinela reconhecível `cus_fallback_${clerkUserId}_${Date.now()}` (localizável via `stripeCustomerId LIKE 'cus_fallback_%'`) + `logger.error` estruturado (nível ERROR, com `clerkUserId`/`email`/`fallbackStripeCustomerId`/erro original, correlacionável no Grafana/Loki). Decisão de criar o usuário mesmo assim (em vez de propagar o erro) documentada em checklist-go-live.md. **Teste:** `tests/unit/application/users/sync-user.use-case.test.ts` (cenário "fallback de customer Stripe") |
| RNF-IDEM-04 | Retries de jobs Inngest não duplicam aplicação de créditos | Retry Safety | RF-BILL-02 a RF-BILL-04, checklist-go-live.md | ✅ | **Implementado (2026-10-12):** Gap confirmado (não era só suspeita): `processStripeWebhook` e `processSubscriptionEvent` (`src/inngest/functions.ts`) chamavam os use cases de billing direto no corpo da função, sem `step.run(...)` — com `retries: 3`, um retry reexecutava a função inteira e duplicava a `CreditTransaction` (o saldo em si não corrompia, porque `resetSubscriptionCredits` é um SET, não soma). Corrigido envolvendo cada use case num `step.run(...)` nomeado — Inngest memoiza o passo já concluído, então um retry não o rechama — seguindo o padrão já usado em `processVideoHandler`. `processStripeWebhook`: passo `"add-credits-from-stripe-checkout"`. `processSubscriptionEvent`: um passo por branch de evento (`"apply-subscription-checkout"`, `"apply-subscription-renewal"`, `"expire-subscription"`, `"update-subscription-status"`). Avaliado endurecer os use cases contra chamada duplicada fora do Inngest (query extra antes de criar a `CreditTransaction`); não implementado nesta tarefa (o `step.run` já resolve o retry do Inngest) — registrado como melhoria futura. **Testes:** `tests/unit/inngest/subscription-inngest.test.ts` (8 casos, TDD red→green: 7 ficaram vermelhos antes do `step.run`), `tests/integration/inngest-billing-step-idempotency.integration.test.ts` (3 casos, Postgres real, confirmando que checkout/renovação de assinatura não duplicam `CreditTransaction` quando a função é retomada com o mesmo `step` memoizado) |

---

### 2.9. Retenção de Dados e Compliance

| ID | Descrição | Categoria | Fonte | Status | Valor/Meta |
|---|---|---|---|---|---|
| RNF-DATA-01 | Arquivos de upload brutos (`uploads/`, `youtube/`) expiram após 1 dia no S3 | Data Lifecycle | `../operacao/aws-s3-lifecycle-rules.md` | ✅ | **1 dia (86400s)** |
| RNF-DATA-02 | Arquivos de clipes finais (`clips/`) retidos indefinidamente | Data Lifecycle | `../operacao/aws-s3-lifecycle-rules.md` | ✅ | **Permanente** |
| RNF-DATA-03 | Logs de `CreditTransaction` retidos indefinidamente (auditoria) | Data Lifecycle | AGENTS.md | ✅ | **Permanente** |
| RNF-DATA-04 | Política de Reembolso documentada e implementada (3 dias de carência) | Compliance | RF-BILL-10 | ✅ | **3 dias de grace period (`pastDueAt`)** |
| RNF-DATA-05 | Direito ao esquecimento (delete account) | Compliance (GDPR-like) | RNF-SEC-13 | ✅ | **Vídeos/clipes apagados do S3+banco e assinatura cancelada de verdade; cadastro anonimizado (não removido), preservando `CreditTransaction`/`Subscription` para auditoria** |

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
| RNF-MAINT-07 | Sem imports não utilizados nem dependências de hook incompletas (0 warnings ESLint) | Code Quality | checklist-go-live.md (HIGH) | ✅ | **Resolvido (2026-10-12):** os 7 warnings (6 `@typescript-eslint/no-unused-vars` + 1 `react-hooks/exhaustive-deps` em `create-project-client.tsx`) foram eliminados — imports/variáveis mortos removidos; a dependência faltante do `useEffect` (`handleFetchMeta`) foi de fato incluída, após virar `useCallback` com identidade estável (`[isConfigRoute, router]`) para não resetar o debounce do efeito a cada render não relacionado à URL. `npm run check`: 0 erros, 0 warnings (antes: 7 warnings). `npm run test`: 873 passed/8 skipped (sem regressão) |
| RNF-MAINT-08 | Use Next.js/Image em vez de `<img>` crua | Performance | checklist-go-live.md (NICE) | ⚠️ | **A DEFINIR — migrar `<img>` para `next/image`** |
| RNF-MAINT-09 | Documentação de design em ADRs (Architecture Decision Records) | Documentation | — | ❌ | **A DEFINIR — criar ADRs para decisões principais (planos, webhook idempotência, etc.)** |
| RNF-MAINT-10 | Backend Python: consolidação de lógica em módulos `core/` compartilhados | Code Structure | RF-PIPE-11 | ✅ | **Modal e local_server compartilham `core/` (youtube_downloader, s3_paths, etc.)** |
| RNF-MAINT-11 | Pipeline de vídeo agnóstico de backend de storage: nenhum `boto3.client("s3")` solto em `core/` de processamento; storage injetado pela porta `ObjectStorage` | Code Structure | RF-PIPE-12 | ✅ | **Verificado por grep (2026-10-10): `import boto3` e `boto3.client(...)` aparecem no código do projeto só em `core/storage/factory.py` (fora de `.venv/` e `asd/`).** Testes: suíte backend (ver RF-PIPE-12). |
| RNF-MAINT-12 | Nome do bucket S3 do backend (Modal + runner local) tem uma única fonte de verdade (`core/storage/factory.py::DEFAULT_BUCKET`), sem literal duplicado em outro módulo | Code Structure | checklist-go-live.md ("Bucket S3 hardcoded divergente") | ✅ | **Resolvido (2026-10-12):** `local_server.py` tinha uma constante de módulo morta (`S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "ai-podcast-clipper")`, nunca lida em nenhum outro ponto do arquivo) duplicando o default já centralizado em `DEFAULT_BUCKET` — removida. `main.py` já não tinha o literal (as linhas originalmente citadas no checklist não existiam mais nesta checagem). **Teste:** `tests/test_bucket_single_source_of_truth.py` (3 casos — guarda `local_server.py` sem o literal/constante própria, e `main.py` sem default hardcoded para `S3_BUCKET_NAME`) |

---

## 3. Matriz de Rastreabilidade: RF → Caso de Uso → Artefato → Teste

Tabela de referência cruzada para validação de funcionalidade ponta a ponta:

| RF ID | Descrição Curta | Caso de Uso Original | Artefato(s) Principal(is) | Use Case / Função | Teste Unitário | Teste Integração | Teste E2E |
|---|---|---|---|---|---|---|---|
| RF-AUTH-01 | Login via Clerk | Autenticação | `clerk-auth.gateway.ts`, `middleware.ts` | `SyncUserUseCase` | ✅ | ✅ | Preparado |
| RF-AUTH-02 | Sessão obrigatória | Controle de acesso | Actions em `src/actions/*` | Middleware + per-action | ✅ | ✅ | Preparado |
| RF-AUTH-03 | Sync Clerk → Postgres | Persistência | `sync-user.use-case.ts` | `SyncUserUseCase` | ✅ | ✅ | Preparado |
| RF-AUTH-04 | Webhook Clerk verificado | Segurança | `src/app/api/webhooks/clerk/route.ts` | `ClerkWebhookHandler` | ✅ | ✅ | Preparado |
| RF-AUTH-05 | Exclusão de conta (RNF-DATA-05) | Compliance | `delete-user-account.use-case.ts`, `delete-account.ts`, `delete-account-section.tsx` | `DeleteUserAccountUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-01 | Custo em créditos | RN-01 | `credit-pricing.service.ts` | `CreditPricingService.calculateCreditCost` | ✅ | — | Preparado |
| RF-BILL-02 | Hold de créditos | Ciclo de vida | `hold-credits.use-case.ts` | `HoldCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-03 | Consume de créditos | Consumo efetivo | `consume-credits.use-case.ts` | `ConsumeCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-04 | Refund de créditos | Recuperação | `refund-credits.use-case.ts` | `RefundCreditsUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-05 | Checkout de assinatura | Pagamento | `process-subscription-checkout.use-case.ts` | `ProcessSubscriptionCheckoutUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-06 | Renovação automática | Renovação | `process-subscription-renewal.use-case.ts` | `ProcessSubscriptionRenewalUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-07 | Expiração de assinatura | Término | `expire-subscription.use-case.ts` | `ExpireSubscriptionUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-08 | Idempotência Stripe | Deduplicação | `ProcessedWebhookEvent`, webhook route | `PrismaProcessedEventRepository` | ✅ | ✅ `stripe-webhook-idempotency.integration.test.ts` (chamada direta do `POST`) + `stripe-webhook-real-http.integration.test.ts` (2026-10-12, HTTP real contra servidor de pé, retry com mesmo `event.id`) | Preparado |
| RF-BILL-09 | Consulta de billing | Dashboard | `users/get-user-billing-data.use-case.ts` | `GetUserBillingDataUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-10 | Payment failed (past_due) | Dunning | `process-payment-failed.use-case.ts` | `ProcessPaymentFailedUseCase` | ✅ | ✅ | Preparado |
| RF-BILL-11 | Charge refund | Revogação | `process-charge-refund.use-case.ts` | `ProcessChargeRefundUseCase` | ✅ | ✅ `stripe-webhook-payment-failure.integration.test.ts` + `stripe-webhook-real-http.integration.test.ts` (2026-10-12, HTTP real contra servidor de pé, payload no formato completo do Stripe) | Preparado |
| RF-BILL-12 | Charge dispute | Revogação | `process-charge-dispute.use-case.ts` | `ProcessChargeDisputeUseCase` | ✅ | ✅ | Preparado |
| RNF-SEC-04 (Inngest) | Validação central das env vars do Inngest + assinatura em `/api/inngest` | Segurança de webhooks/filas | `src/env.js`, `src/inngest-env-guard.js`, `src/app/api/inngest/route.ts` | `assertInngestProductionEnv` | ✅ `tests/unit/config/inngest-env-validation.test.ts` | ✅ `tests/integration/inngest-serve-signature.integration.test.ts` | Preparado (mesma URL/headers de `/api/inngest` que um e2e usaria) |
| RNF-IDEM-05 | Sem fila em memória para eventos Stripe em produção | Durabilidade de webhook | `src/infrastructure/queue/stripe-queue.ts` | `assertInMemoryFallbackAllowed` (`StripeBackgroundQueue.enqueue`/`enqueueSubscription`) | ✅ `tests/unit/infrastructure/queue/stripe-queue.production-guard.test.ts` | ✅ `tests/integration/stripe-webhook-in-memory-queue-production-guard.integration.test.ts` (rota real + fila real + Postgres: produção sem key → 5xx e evento não marcado; controle fora de produção → 200) | Preparado (request HTTP assinado real em `/api/webhooks/stripe`) |
| RNF-IDEM-04 | Retries de jobs Inngest (`retries: 3`) não duplicam `CreditTransaction` de billing | Retry Safety | `src/inngest/functions.ts` (`processStripeWebhook`, `processSubscriptionEvent`) | `step.run("add-credits-from-stripe-checkout"/"apply-subscription-checkout"/"apply-subscription-renewal"/"expire-subscription"/"update-subscription-status", ...)` | ✅ `tests/unit/inngest/subscription-inngest.test.ts` | ✅ `tests/integration/inngest-billing-step-idempotency.integration.test.ts` (Postgres real via `useRollbackTransactionPerTest`, mesma memória de `step` reaproveitada entre 1ª execução e retry simulado) | Preparado (dados determinísticos, mesmos use cases/factories reais de produção) |
| RF-INGEST-01 | Import YouTube | Segurança SSRF | `videos/import-youtube-video.use-case.ts`, `YouTubeUrl` | `ImportYouTubeVideoUseCase` | ✅ | ✅ | Preparado |
| RF-INGEST-02 | Host validation backend + contrato de `s3_key` (RNF-SEC-06, RNF-SEC-18) | Segurança SSRF L2 | `youtube_downloader.py`, `core/schemas.py::DownloadYouTubeRequest`, `main.py`/`local_server.py::download_youtube` | `_assert_youtube_host()`, `download_youtube_to_s3()` | ✅ `tests/test_youtube_downloader.py::TestHostValidation`, `tests/test_download_youtube_hardening.py::TestDownloadYouTubeRequestS3KeyContract`, frontend `tests/unit/inngest/download-youtube-request-body.test.ts` | ✅ (backend) `tests/test_download_youtube_hardening.py::TestMainDownloadYouTubeHttp`, `tests/test_local_server.py::TestLocalDownloadYouTube` (HTTP via `TestClient`) | Preparado (`/download_youtube` real, chaves UUID determinísticas) |
| RNF-SEC-19 | `s3_key` do `/process_video` restrito aos formatos do sistema, sem leitura de arquivo local | Segurança (leitura arbitrária de arquivo) | `core/schemas.py::ProcessVideoRequest` (`PROCESS_VIDEO_S3_KEY_PATTERN`), `core/video_pipeline.py::resolve_input_video_path`, `main.py`/`local_server.py::process_video` | `resolve_input_video_path()` | ✅ `tests/test_process_video_s3_key_hardening.py::TestProcessVideoRequestS3KeyContract`, `tests/test_video_pipeline.py::TestResolveInputVideoPath` | ✅ (backend) `tests/test_process_video_s3_key_hardening.py::TestMainProcessVideoHttp`, `tests/test_local_server.py::TestLocalProcessVideoS3KeyHardening` (HTTP via `TestClient`) | Preparado (`/process_video` real, chaves UUID determinísticas servidas pelo `FakeObjectStorage`) |
| RF-INGEST-03 | Enfileiramento automático | Orquestração | `videos/import-youtube-video.use-case.ts` | IQueueGateway | — | ✅ | Preparado |
| RF-INGEST-04 | Rate limit YouTube | Abuso | `InMemorySlidingWindowRateLimiter` | Rate limiter | ✅ | ✅ | Preparado |
| RF-INGEST-05 | Generate presigned URL | Upload seguro | `videos/generate-upload-url.use-case.ts` | `GenerateUploadUrlUseCase` | ✅ | ✅ | Preparado |
| RF-INGEST-06 | Validação tipo + tamanho | Validação | `generate-upload-url.schema.ts` | Schema Zod | ✅ | — | Preparado |
| RF-INGEST-07 | Rate limit upload URL | Abuso | `InMemorySlidingWindowRateLimiter` | Rate limiter | ✅ | ✅ | Preparado |
| RF-INGEST-08 | Upload direto S3 | Fluxo ingestão | Não implementado | handleUpload (removido) | ❌ | ❌ | Stub |
| RF-INGEST-09 | Auth + rate limit em preview de metadata YouTube | Controle de acesso + Abuso | `src/app/api/youtube/info/route.ts` | `makeYouTubeInfoRateLimiter`, `makeAuthGateway` | ✅ | ✅ | Preparado |
| RF-INGEST-10 | Download parcial no modo manual (`/download_youtube` + `manual_cuts`) | Custo/armazenamento | `core/youtube_downloader.py`, `core/time_ranges.py`, `core/schemas.py`, `src/inngest/functions.ts` | `download_youtube_to_s3`, `remap_manual_cuts`, `downloadYouTubeVideo`, `processVideoHandler` | ✅ | ✅ | Concluído (backend + frontend) |
| RF-PIPE-01 | Transcrição WhisperX | Processamento | `core/transcription.py` | `process_video()` | ✅ | — (sem teste dedicado) | Preparado |
| RF-PIPE-02 | Identificação virais (Gemini) | IA | `core/moments.py` | Gemini API call | ✅ | ✅ | Preparado |
| RF-PIPE-03 | Detecção falante ativo | Localização | `asd/` (submódulo) | LR-ASD integration | — | — | Preparado |
| RF-PIPE-04 | Corte/crop vertical | Renderização | `core/vertical_video.py` | GPU processing | ✅ | — (sem teste dedicado) | Preparado |
| RF-PIPE-05 | Legendas (11 presets na UI; allowlist de 12 valores no contrato) | Subtitles | `core/subtitle_styles.py`, `core/subtitles.py`, `core/schemas.py` | Style generation | ⚠️ (13 passed; `NONE` sem implementação) | ✅ | Preparado — gap `NONE` aberto |
| RF-PIPE-06 | Upload final S3 | Armazenamento | `core/clip_pipeline.py`, `core/s3_paths.py` | S3 upload | ✅ | ✅ | Preparado |
| RF-PIPE-07 | Auth Bearer token | Segurança | `main.py:112-117,149-154`, `local_server.py` | Token validation | ✅ | ✅ | Preparado |
| RF-PIPE-08 | Cortes manuais | Customização | `core/schemas.py`, `core/video_pipeline.py`, `buildProcessVideoPayload`, UI `create-project-client.tsx` + `src/lib/manual-cut-rows.ts` + `src/lib/time-format.ts` | `TriggerVideoProcessingUseCase`, `buildProcessVideoPayload`, `ProcessVideoRequest`, `importYouTubeVideo` (`mode: "manual"`) | ✅ | ✅ (UI: `tests/unit/components/create-project-client.test.tsx`, `tests/unit/lib/time-format.test.ts`, `tests/unit/lib/manual-cut-rows.test.ts`; action: `tests/integration/actions/youtube-actions.integration.test.ts`) | Preparado (contrato v2 — ressalvas no checklist; UI de criação sem modo edição/retry) |
| RF-PIPE-09 | Retry automático | Resiliência | `retry-project.use-case.ts` (sem subpasta) | `RetryProjectUseCase` | ✅ | ✅ | Preparado |
| RF-PIPE-10 | Circuit breaker | Resiliência | — | — | ❌ | ❌ | Pendente |
| RF-PIPE-11 | Consolidação Modal+local | Manutenibilidade | `ai-podcast-clipper-backend/core/` | Shared modules | ✅ | ✅ | Preparado |
| RF-PIPE-12 | Storage plugável (`ObjectStorage`: S3 real, MinIO via `S3_ENDPOINT_URL`, local) | Armazenamento / Portabilidade | `ai-podcast-clipper-backend/core/storage/` (`factory.py`, `ports.py`, adapters); `ai-podcast-clipper-frontend/src/infrastructure/factories/storage-gateway.factory.ts` | `create_object_storage` (backend), `createStorageGateway` (frontend), `assertStorageEndpointAllowed` (guard de produção) | ✅ | ✅ (backend `pytest -m minio` + frontend `s3-storage.minio.integration.test.ts`; ambos com skip gracioso se MinIO indisponível, nenhum provisiona MinIO no CI) | Preparado — MinIO só em dev local; guard de produção em ambos os lados (RNF-SEC-17, resolvido 2026-10-11) |
| RF-PIPE-13 | Provedor de IA plugável para momentos virais (`MomentsProvider`: Gemini ou Claude via `MOMENTS_PROVIDER`) | Resiliência / Portabilidade | `ai-podcast-clipper-backend/core/moments_port.py`, `core/moments.py`, `core/claude_moments.py`, `core/moments_factory.py` | `create_moments_provider` (factory), `MomentsProvider.identify_moments` | ✅ | ✅ (backend: `test_moments_factory.py`, `test_claude_moments.py`, `test_video_pipeline.py`; 36 passed em 2026-10-11) | Preparado — troca manual; adapter Claude sem teste contra API real; `.env.example` sem o bloco de config (ver checklist) |
| RF-PIPE-14 | Limite do plano e hold pela soma dos cortes (modo manual) + falha antecipada de corte além do vídeo | Cobrança/Validação | `src/domain/services/processing-duration.service.ts`, `src/inngest/functions.ts` | `processVideoHandler` (Step 1) | ✅ | ✅ | Preparado |
| RF-PIPE-15 | Transcrição por clipe (`words` relativas ao clipe → `Clip.transcriptWords`) | Transcrição/Edição | `core/clip_pipeline.py` (`extract_clip_words`) | `process_clip` | ✅ | ✅ | `tests/test_clip_pipeline.py::TestClipWords`, `tests/test_local_server.py` |
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
- **Total de RNFs:** 75 (+1 em 2026-10-12 na rodada de billing: RNF-IDEM-06, fallback de customer Stripe; +2 na rodada de 4 itens HIGH, 2026-10-12: RNF-SCALE-06 e RNF-MAINT-12; +1 nesta rodada, 2026-10-12: RNF-RL-06, rate limit com estado compartilhado via Upstash Redis)
- **Status ✅ (Implementado):** 40 RNFs (53% — inclui RNF-SEC-04, RNF-IDEM-05 e RNF-SEC-19 (2026-10-11); em 2026-10-12 (rodada de billing): RNF-IDEM-04, RNF-IDEM-02 corrigida de ⚠️ para ✅, e o novo RNF-IDEM-06; em 2026-10-12 (rodada de 4 itens HIGH): os novos RNF-SCALE-06 (índices FK) e RNF-MAINT-12 (bucket S3 fonte única), e RNF-MAINT-07 corrigida de ⚠️ para ✅ (0 warnings ESLint); e em 2026-10-12 (rate limiting serverless): o novo RNF-RL-06 (implementação completa e testada, falta só validação manual do usuário com credenciais Upstash reais))
- **Status ⚠️ (Implementado parcialmente ou sem baseline definido):** 19 RNFs (25% — inclui RNF-SEC-09, CSP, agora em Report-Only)
- **Status ❌ (Não implementado):** 16 RNFs (21% — maioria são "A DEFINIR" pelo usuário)

### RNFs Críticos "A DEFINIR"
1. ~~**RNF-SEC-09** — Content Security Policy (CSP)~~ — parcial (2026-10-11): Report-Only ativo, falta validação ao vivo + decisão de promover para enforce
2. ~~**RNF-SEC-10** — Proteção de endpoint de debug~~ — resolvido em 2026-10-11 (endpoint removido)
3. **RNF-SEC-12** — Pinning de versões Python
4. **RNF-SEC-13** — Fluxo de exclusão de conta
5. **RNF-UPLOAD-03** — Duração máxima de vídeo
6. **RNF-RL-03** — Rate limit no backend (`/process_video`, `/download_youtube`) — RNF-RL-04 e RNF-RL-05 (actions de projeto e billing) resolvidos em 2026-10-11
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
