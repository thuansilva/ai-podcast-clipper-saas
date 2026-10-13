# Casos de Uso, Regras de Negócio e Status de Implementação

Catálogo consolidado do que o **AI Podcast Clipper** faz hoje, regra por
regra, com o status real de implementação e de teste — para responder "isso
já foi feito?" sem precisar ler todo o código toda vez.

> **Como manter isso atualizado**: ao implementar ou alterar uma regra de
> negócio, atualize a linha correspondente nesta tabela na mesma tarefa (o
> `AGENTS.md` já exige TDD para toda mudança — atualizar este catálogo é
> parte de "pronto", junto com o teste).
>
> **Relação com `../historico/superpowers/specs/`**: aquela pasta tem o *design*
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
| Toda server action/rota sensível exige sessão válida antes de agir | Todas as actions em `src/actions/*`, rota `/api/local-storage` | ✅ (ver `../operacao/checklist-go-live.md` para o detalhe de que o *middleware* só cobre `/dashboard`, não `/api/**` — cada handler se protege individualmente) |
| Sincronização de usuário Clerk → banco local (`User`) | `SyncUserUseCase` (`src/application/use-cases/users/sync-user.use-case.ts`) | ✅ testado (`tests/unit/application/users/sync-user.use-case.test.ts`) |
| Webhook do Clerk idempotente/verificado | `src/app/api/webhooks/clerk/route.ts` | ✅ |

Spec detalhado: `../historico/superpowers/specs/2026-09-12-clerk-auth-clean-architecture-spec.md`.

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

Specs: `../historico/superpowers/specs/2026-09-14-recurring-subscriptions-and-credit-packs-design.md`.

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

Specs: `../historico/superpowers/specs/2026-09-15-dynamic-video-options-design.md`.

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
| Geração e queima de legendas (presets da UI: HORMOZI, POPPING_GREEN, GAMER, LOUD, NEON, TRUE_CRIME, MINIMAL, CORPORATE, VLOG, ASMR, NONE; alias legado CLEAN). Allowlist em RN-PIPE-PRESET-01 | `core/subtitle_styles.py`, `core/subtitles.py`, `core/schemas.py` | ✅ testado (`tests/test_subtitles.py`, `tests/test_clip_pipeline.py`, `tests/test_font_contract.py`). `NONE` = sem queima de legenda (RN-PIPE-PRESET-02); fontes instaladas no runner (RN-PIPE-PRESET-04) |
| Upload do clipe final para S3 | `main.py` / `local_server.py` | ✅ |
| Autenticação por Bearer token nos endpoints do backend | `main.py` (produção) e `local_server.py` (local) | ✅ — **`local_server.py` não tinha essa checagem até esta sessão**, corrigido |
| Cortes manuais por timestamp (usuário define os cortes em vez da IA escolher) — contrato `POST /process_video` v2 (RF-PIPE-08) | Backend: `core/schemas.py` (`ManualCut`, `ProcessVideoRequest`), `core/video_probe.py`, `core/video_pipeline.py`. Frontend: `buildProcessVideoPayload`, `RetryProjectUseCase`, guard `ManualCutsRequiredError` em `src/inngest/functions.ts`. **Correção:** esta linha estava marcada ✅ antes de 2026-10-09, quando o backend descartava `mode`/`manual_cuts` e o frontend derivava `mode` de `clipModel`; o status agora reflete o código atual (ver RN-PIPE-MANUAL-01 a 14 abaixo) | ✅ testado |
| **RN-PIPE-MANUAL-01**: `mode` aceita exatamente `"auto"` (default) e `"manual"`; é ortogonal ao layout (`clipModel` = `"auto"`/`"face_focus"`), que nunca é lido como modo de processamento | `ProcessVideoRequest.mode` (`core/schemas.py`), `buildProcessVideoPayload` (`src/application/services/process-video-payload.service.ts`) | ✅ testado (`tests/test_process_video_contract.py::test_mode_rejects_values_outside_auto_and_manual`; `tests/unit/application/services/process-video-payload.service.test.ts`) |
| **RN-PIPE-MANUAL-02**: `mode="manual"` exige `manual_cuts` não vazio; sem cortes, a requisição é rejeitada (422), nunca cai para o automático. No frontend, `ManualCutsRequiredError` é lançado antes do hold de créditos | `ProcessVideoRequest.validate_mode_and_manual_cuts`; `src/inngest/functions.ts` (guard antes de `HoldCreditsUseCase`) | ✅ testado (`tests/test_process_video_contract.py::test_manual_mode_without_cuts_is_rejected`; `tests/test_local_server.py::test_manual_mode_without_cuts_returns_422`; `tests/unit/inngest/manual-cuts-pipeline.test.ts`, cenário "mode for manual e a lista de cortes estiver vazia") |
| **RN-PIPE-MANUAL-03**: `mode="auto"` não aceita `manual_cuts`; se enviado com cortes, a requisição é rejeitada (422) | `ProcessVideoRequest.validate_mode_and_manual_cuts` | ✅ testado (`tests/test_process_video_contract.py::test_auto_mode_with_manual_cuts_is_rejected`; `tests/test_local_server.py::test_auto_mode_with_manual_cuts_returns_422`). **Ressalva:** os schemas Zod do frontend ainda aceitam `mode: "auto"` com `manualCuts`; a rejeição acontece no guard do Inngest antes do hold (RN-PIPE-MANUAL-15) |
| **RN-PIPE-MANUAL-04**: cada corte exige `end > start` e duração ≤ 60s (mesmo limite do automático). Supersede o limite 5s–180s do spec de 2026-09-13, que nunca foi implementado no backend. Hardening (2026-10-09): `start`/`end` precisam ser números finitos (`allow_inf_nan=False`; o JSON do Python aceita `NaN`/`Infinity`, que antes passavam pelas validações) e `title` tem no máximo 200 caracteres (`MAX_MANUAL_CUT_TITLE_LENGTH`, mesmo teto do Zod) | `ManualCut.validate_duration` (`_validate_clip_duration`); `ManualCut` em `core/schemas.py` (`ConfigDict(extra="forbid", allow_inf_nan=False)`); `src/domain/schemas/manual-cut.schema.ts` | ✅ testado (`tests/test_process_video_contract.py::test_rejects_cut_longer_than_sixty_seconds`, `test_rejects_end_not_greater_than_start`; `tests/test_manual_cut_input_hardening.py` (NaN/Infinity em `start`/`end`, título acima de 200 → 422); `tests/unit/domain/schemas/manual-cut.schema.test.ts`) |
| **RN-PIPE-MANUAL-05**: no máximo 50 cortes manuais (mesmo teto do Zod do frontend) | `ManualCut`/`manual_cuts` (`MAX_MANUAL_CUTS` em `core/schemas.py`); `MAX_MANUAL_CUTS` em `manual-cut.schema.ts` | ✅ testado (`tests/test_process_video_contract.py::test_rejects_more_than_fifty_manual_cuts`; `tests/unit/domain/schemas/manual-cut.schema.test.ts`) |
| **RN-PIPE-MANUAL-06**: após download/probe, se qualquer corte tiver `end` maior que a duração real do vídeo (ffprobe), a requisição inteira é rejeitada (422), antes da transcrição | `core/video_probe.py` (`get_video_duration_seconds`, `validate_manual_cuts_against_duration`); `core/video_pipeline.py`; handler 422 em `local_server.py` | ✅ testado (`tests/test_video_probe.py::test_rejects_whole_request_when_any_single_cut_is_out_of_range`; `tests/test_video_pipeline.py::test_cut_exceeding_real_duration_is_rejected_before_transcription`; `tests/test_local_server.py::test_manual_cut_exceeding_real_video_duration_returns_422`). **Ressalva:** o handler 422 de `main.py` (Modal) não tem teste direto |
| **RN-PIPE-MANUAL-07**: cortes sobrepostos entre si são permitidos; sem validação de overlap no modo manual | `core/video_probe.py::validate_manual_cuts_against_duration` (só checa duração) | ✅ testado (`tests/test_video_probe.py::test_allows_overlapping_cuts`) |
| **RN-PIPE-MANUAL-08**: no modo manual, `identify_moments` (Gemini) é pulado; a transcrição (WhisperX) continua existindo porque as legendas dependem dela, mas **só o áudio dos cortes é transcrito**, nunca o vídeo inteiro. Cada corte ganha margem de 0,5s (limitada a `[0, duração]`), os intervalos que se sobrepõem ou se tocam são mesclados antes (sem palavras duplicadas) e os tempos das palavras são deslocados pelo início do trecho, continuando absolutos no vídeo original. O modo automático segue transcrevendo o vídeo inteiro (o Gemini precisa dele) | `core/video_pipeline.py::run_video_processing_pipeline`, `core/transcription.py` (`WhisperTranscriber.transcribe_range`, `merge_time_ranges`) | ✅ testado (`tests/test_video_pipeline.py::test_does_not_call_gemini_identify_moments`, `test_never_transcribes_the_whole_video`, `test_overlapping_cuts_are_merged_into_a_single_range`, `test_distant_cuts_are_transcribed_separately_with_margin`, `test_margin_is_clamped_to_video_duration`, `test_merged_transcript_has_no_duplicate_words_and_is_sorted`, regressão `TestAutoModeRegression`; `tests/test_transcription_ranges.py`; `tests/test_local_server.py::test_manual_mode_transcribes_only_the_cut_ranges`, `test_manual_mode_skips_gemini_and_never_transcribes_whole_video`) |
| **RN-PIPE-MANUAL-09**: no modo manual, todos os cortes enviados são processados; `clips_limit=5` (automático) não se aplica | `core/video_pipeline.py::run_video_processing_pipeline` | ✅ testado (`tests/test_video_pipeline.py::test_ignores_clips_limit_and_processes_every_cut`) |
| **RN-PIPE-MANUAL-10**: o título do clipe de corte manual é o `title` do corte; sem título, usa `"Manual clip {N}"` (N 1-based) | `core/clip_pipeline.py::process_clip` | ✅ testado (`tests/test_clip_pipeline.py::test_manual_cut_title_is_used_as_clip_title`, `test_manual_cut_without_title_falls_back_to_numbered_title`) |
| **RN-PIPE-MANUAL-11**: clipes de corte manual não têm `hook`, `virality_score` nem `reason` (`null`); esses campos só existem na origem automática (Gemini) | `core/clip_pipeline.py::process_clip` (ramo `isinstance(clip_item, ManualCut)`) | ✅ testado (`tests/test_clip_pipeline.py::test_manual_cut_has_no_hook_virality_score_or_reason`; `test_clip_item_keeps_hook_virality_score_and_reason`) |
| **RN-PIPE-MANUAL-12**: `aspect_ratio`, `auto_zoom` e `genre` são aceitos pelo contrato, mas **não têm efeito** no processamento (D1) — gap conhecido, a ser tratado por RF futuro | `ProcessVideoRequest` (`core/schemas.py`) | ⚠️ aceito, sem efeito (`tests/test_process_video_contract.py::test_accepts_aspect_ratio_auto_zoom_and_genre_without_effect` valida só a aceitação) |
| **RN-PIPE-MANUAL-13**: qualquer campo fora do conjunto conhecido (`s3_key`, `preset`, `mode`, `manual_cuts`, `aspect_ratio`, `auto_zoom`, `genre`) gera 422 (`extra="forbid"`); nada é descartado em silêncio | `ProcessVideoRequest` e `ManualCut` (`model_config = ConfigDict(extra="forbid")`) | ✅ testado (`tests/test_process_video_contract.py::test_rejects_unknown_top_level_field`, `test_rejects_unknown_field_inside_manual_cut`; `tests/test_local_server.py::test_unknown_field_returns_422`) |
| **RN-PIPE-MANUAL-14**: `mode` default `"auto"`; chamadores antigos que enviam só `s3_key`/`preset` continuam funcionando | `ProcessVideoRequest.mode` (`core/schemas.py`) | ✅ testado (`tests/test_process_video_contract.py::test_mode_defaults_to_auto_when_omitted`, `test_legacy_payload_with_only_s3_key_and_preset_is_still_valid`; `tests/test_local_server.py::test_legacy_payload_without_mode_still_runs_automatic_path`) |
| **RN-PIPE-MANUAL-15** (2026-10-09): `mode` do evento e presença de cortes devem ser consistentes **antes de reservar crédito**. Cortes presentes com `mode` omitido ou `"auto"` → rejeição (`ManualCutsModeMismatchError`); `mode="manual"` sem cortes → `ManualCutsRequiredError` (RN-PIPE-MANUAL-02). Motivo: o hold cobra pelo `mode` do evento, mas o payload enviado ao GPU deriva o modo da presença de cortes (D6). Sem o guard, era possível cobrar 1 crédito e processar até 50 clipes em modo manual. Nenhum hold, nenhuma chamada ao GPU | `src/inngest/functions.ts` (guards antes de `makeHoldCreditsUseCase`) | ✅ testado (`tests/unit/inngest/manual-cuts-billing-consistency.test.ts`: rejeita cortes com `mode` omitido e `'auto'` antes do hold e antes do GPU; `tests/integration/manual-cuts-billing-consistency.integration.test.ts`) |
| **RN-PIPE-MANUAL-16** (2026-10-11): no modo manual, o limite de duração do plano (2h normal, 3h Pro) e o `durationSeconds` da reserva de créditos usam a **soma das durações dos cortes**, não o vídeo inteiro (um corte de 40s num vídeo de 5h passa no limite e reserva 1 crédito). Modo automático inalterado (trecho do Fatiador, senão vídeo inteiro) | `computeEffectiveProcessingDuration` (`src/domain/services/processing-duration.service.ts`), usado em `processVideoHandler` | Unit: `tests/unit/domain/services/processing-duration.service.test.ts`, `tests/unit/inngest/manual-cuts-billing-consistency.test.ts`; integração: `tests/integration/manual-cuts-billing-consistency.integration.test.ts` |
| **RN-PIPE-MANUAL-17** (2026-10-11): no modo manual, se algum corte tiver `endTime` maior que a duração do vídeo (conhecida após o download), o Inngest lança `ManualCutBeyondVideoError` **antes** de reservar créditos (arquivo `failed`, sem hold, GPU não chamado). O backend mantém a checagem (RN-PIPE-MANUAL-06) como segunda camada | `assertManualCutsWithinVideo`, `src/domain/errors/manual-cut-beyond-video-error.ts` | Mesmos testes da RN-PIPE-MANUAL-16 |
| **RN-PIPE-MANUAL-18** (2026-10-12, ponta do frontend concluída): `POST /download_youtube` aceita `manual_cuts` (tempos absolutos no vídeo original). Quando presente e não vazio, só o(s) trecho(s) que cobrem esses cortes são baixados — mesclados entre si com margem de `VIDEO_RANGE_MARGIN_SECONDS=2.0s` (maior que os 0,5s usados para transcrição, RN-PIPE-MANUAL-08: LR-ASD e o corte/legenda do clipe final trabalham com janelas de *frames*, não só palavras, e se beneficiam de mais folga) — e concatenados (ffmpeg concat demuxer, `-c copy` com fallback para reencode) num **único** arquivo final em `s3_key`, nunca um arquivo por trecho. `duration` na resposta continua sendo a duração do vídeo **original** (não do arquivo menor), porque `assertManualCutsWithinVideo`/`validateVideoDuration` no Inngest (RN-PIPE-MANUAL-16/17) comparam tempos absolutos dos cortes contra essa duração, antes de qualquer remapeamento. **Decisão de onde remapear:** o backend calcula e devolve `remapped_cuts` (cada corte com `new_start`/`new_end` já convertidos para o vídeo menor) na própria resposta de `/download_youtube`, usando a função pura `core/time_ranges.py::remap_cuts_to_output` internamente (via `core/youtube_downloader.py::remap_manual_cuts`) — decisão para reduzir risco de o frontend reimplementar essa conta em TypeScript e divergir da lógica real de merge/concat do backend. Sem `manual_cuts`, comportamento idêntico ao de antes (vídeo inteiro, sem chamada extra de metadata, sem merge, sem concat). **Ponta do frontend (`src/inngest/functions.ts`):** `downloadYouTubeVideo` envia `event.data.manualCuts` como `manual_cuts` quando `mode="manual"` tem cortes, e devolve `remappedCuts`/`remappedRanges` quando a resposta os traz; `processVideoHandler` guarda os cortes remapeados na reserva de créditos (`reservation.remappedManualCuts`, só preenchido para vídeos do YouTube com cortes) e os usa no payload de `/process_video` do step `call-modal-gpu` em vez dos originais, preservando `id`/`title` originais na mesma ordem — o vídeo armazenado em `s3Key` depois do download é o arquivo concatenado menor, então enviar os tempos originais apontaria para os trechos errados. Falha explícita, sem fallback silencioso para os tempos originais, se o modo é manual num vídeo do YouTube e o backend não devolveu `remapped_cuts` (edge case). Uploads diretos (`sourceType !== "YOUTUBE"`) nunca passam por esse remapeamento. `UploadedFile.manualCutsJson` (cortes originais, usado pelo retry e pelas telas de edição) nunca é sobrescrito com os valores remapeados — só o `manual_cuts` do payload HTTP de `/process_video` passa a ser outro. **Correção de integridade (2026-10-12):** o `format_spec` do yt-dlp usado nesse download parcial restringe o formato de vídeo a protocolo HTTPS (`[protocol^=https]`), porque sem essa restrição o yt-dlp podia escolher um formato HLS (`m3u8_native`) que, combinado com `download_ranges` + `force_keyframes_at_cuts`, produzia silenciosamente um arquivo final **sem faixa de vídeo** (só áudio, exit code 0) — bug só descoberto muito mais adiante no pipeline, como um erro genérico do LR-ASD. Antes do upload, `core/video_probe.py::has_video_stream` (ffprobe, `-select_streams v`) confirma que o arquivo concatenado tem pelo menos uma faixa de vídeo; se não tiver, levanta `YouTubeDownloaderError` explícito em vez de deixar o arquivo quebrado seguir pro resto do pipeline | `core/youtube_downloader.py` (`download_youtube_to_s3`, `_download_time_ranges_to_s3`, `_concat_video_segments`, `remap_manual_cuts`), `core/video_probe.py` (`has_video_stream`), `core/time_ranges.py` (`merge_time_ranges`, `build_range_offsets`, `remap_cut_to_output`/`remap_cuts_to_output`), `core/schemas.py` (`DownloadYouTubeRequest.manual_cuts`, `RemappedTimeRange`, `RemappedManualCut`), `src/inngest/functions.ts` (`downloadYouTubeVideo`, `processVideoHandler`) | ✅ testado (backend: `tests/test_time_ranges.py`; `tests/test_youtube_downloader.py::TestDownloadYouTubeToS3WithTimeRanges`, `TestDownloadYouTubeToS3WithoutTimeRangesRegression`, `TestRemapManualCuts`, `test_range_format_spec_excludes_hls_protocol`, `test_raises_explicit_error_when_downloaded_file_has_no_video_stream`; `tests/test_video_probe.py::TestHasVideoStream`; `tests/test_local_server.py::TestLocalDownloadYouTube`. Frontend: `tests/unit/inngest/download-youtube-request-body.test.ts`, `tests/unit/inngest/youtube-manual-cuts-remap.test.ts`, `tests/integration/inngest-pipeline.test.ts` Cenário 8/9) |
| **RN-PIPE-PRESET-01** (2026-10-09): `preset` de legenda pertence a uma allowlist fechada (`SubtitlePreset` no backend; `PROJECT_SUBTITLE_PRESETS` no frontend). Valor fora da lista → 422 antes de qualquer pipeline, e nunca chega a um comando. Motivo: antes, `preset` era concatenado em `subprocess.run(..., shell=True)` com limite só de 50 caracteres, o que permitia execução remota de código no container de GPU (RNF-SEC-16). Além da allowlist, o `subprocess` do fluxo de legenda passou a usar lista de argumentos com `shell=False`. **Ressalvas resolvidas (2026-10-13):** `NONE` não cai mais para HORMOZI (RN-PIPE-PRESET-02) e projetos antigos com preset fora da lista não recebem mais 422 no retry (RN-PIPE-PRESET-03) | `core/schemas.py` (`SubtitlePreset`, `SUBTITLE_PRESETS`), `core/subtitles.py`; `src/domain/schemas/process-video.schema.ts`, `src/domain/schemas/import-youtube-video.schema.ts` | ✅ testado para allowlist e shell (`tests/test_preset_shell_injection.py`, `tests/test_local_server.py::test_shell_metachar_preset_returns_422_before_pipeline`; `tests/unit/domain/schemas/process-video.schema.test.ts`; `tests/unit/domain/schemas/import-youtube-video.schema.test.ts`). ✅ (ver RN-PIPE-PRESET-02 a 04) |
| **RN-PIPE-PRESET-02** (2026-10-13): `preset` `NONE` ("Sem Legenda") significa **não queimar nenhuma legenda**. `process_clip` pula a etapa de legenda e envia ao S3 o vídeo vertical 9:16 gerado antes dela, sem legenda (metadados do clipe continuam com `preset: "NONE"`). `get_preset_style("NONE")` levanta `ValueError`, então nenhum caminho cai silenciosamente para HORMOZI. Motivo: antes, o preset `NONE` era aceito pelo contrato mas renderizava HORMOZI | `core/clip_pipeline.py::process_clip`, `core/subtitle_styles.py::get_preset_style` | ✅ testado (`tests/test_clip_pipeline.py::TestNonePresetSkipsSubtitleBurn`; `tests/test_local_server.py::test_preset_none_skips_subtitle_burn_and_uploads_plain_vertical_video`; `tests/test_subtitles.py::TestPresetStyles::test_none_preset_raises_instead_of_silently_falling_back_to_hormozi`, `TestGenerateAssSubtitlesNonePresetGuard`) |
| **RN-PIPE-PRESET-03** (2026-10-13): no **retry sem troca explícita de preset**, o `subtitlePreset` salvo é normalizado. Valor ausente ou fora da allowlist atual (`PROJECT_SUBTITLE_PRESETS`) vira `HORMOZI`, e o valor normalizado é **gravado de volta** no projeto (correção oportunista do dado legado). Preset válido é preservado, inclusive `NONE`. Quando o retry troca o preset, o valor já vem validado pelo schema de borda e não é renormalizado. Motivo: projetos criados antes da allowlist tinham preset legado e recebiam 422 do backend | `src/domain/value-objects/subtitle-preset.vo.ts`, `src/application/use-cases/retry-project.use-case.ts` | ✅ testado (`tests/unit/application/retry-project.use-case.test.ts`, bloco "normalização de subtitlePreset legado"; `tests/integration/actions/projects-actions.integration.test.ts`) |
| **RN-PIPE-PRESET-04** (2026-10-13): toda família de fonte usada por um preset (`PRESET_FONT_FAMILIES`) precisa ter download em `FONT_FILE_DOWNLOADS` e estar instalada no runner: na imagem Modal (`main.py`) e, para o `local_server.py` em GPU própria, via `scripts/install-fonts.sh`. Só são usadas fontes livres (coleção google/fonts, licença OFL ou Apache 2.0); Arial, Helvetica, Impact, Courier New e Georgia não são referenciadas. Fonte ausente **não gera erro** (fontconfig substitui silenciosamente), por isso o contrato é coberto por teste | `core/fonts.py`, `main.py`, `scripts/install-fonts.sh`, `core/subtitle_styles.py` | ✅ testado (`tests/test_font_contract.py`; `tests/test_subtitles.py::TestPresetStyles::test_every_supported_preset_uses_a_free_installable_font`, `test_proprietary_fonts_are_never_referenced`). Instalação real: `tests/test_fonts_installed_locally.py` (skipped sem as fontes instaladas localmente) |
| Retry automático de processamento falho | `src/actions/generation.ts` não expõe retry direto; `retry-project.use-case.ts` reprocessa um projeto existente | ✅ testado |
| Circuit breaker / timeout nas chamadas para Modal e Gemini | — | ❌ não implementado (item da Fase 2 do roadmap de resiliência, ainda em aberto) |
| Teste de carga/caos simulando falha do backend Modal | `load-tests/scenarios/` (k6) | ❌ não implementado — só há cenários de carga "caminho feliz" |

Specs: `../historico/superpowers/specs/2026-09-18-local-gpu-processing-design.md`,
`../historico/superpowers/specs/2026-09-13-manual-cuts-timestamp-design.md` (superseded nas regras de duração), `../historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md` (contrato v2 e RN-PIPE-MANUAL-01 a 14).

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

Specs: `../historico/superpowers/specs/2026-09-17-meus-projetos-design.md`,
`../historico/superpowers/specs/2026-09-23-project-management-design.md`.

---

## 7. Segurança transversal (detalhe → ver checklist dedicado)

Autenticação, autorização/IDOR, validação de entrada, rate limiting, path
traversal e headers HTTP têm seu próprio rastreamento detalhado, item a item,
em **`../operacao/checklist-go-live.md`** (que incorpora os controles do OWASP ASVS Nível 2) — não duplicado aqui para não divergir.

---

## Resumo: o que está claramente incompleto hoje

1. **Upload direto de arquivo** — só a importação por URL do YouTube funciona ponta a ponta; o upload direto é um stub na UI (seção 3).
2. **Legendas** — resolvido em 2026-10-13: `NONE` não queima mais legenda, o retry normaliza preset legado e as fontes dos 11 presets são instaladas no runner (seção 4, RN-PIPE-PRESET-02 a 04). `tests/test_subtitles.py` passa (verificado em 2026-10-13).
3. **Resiliência** — sem circuit breaker para Modal/Gemini, sem teste de carga simulando falha de GPU (seção 4; Fase 2 do roadmap original).
4. **SRE/observabilidade** — sem Sentry/logging estruturado, sem SLI/SLO definidos, sem pipeline de CD (Fase 3 do roadmap original — não coberto por este catálogo de regras de negócio, é infraestrutura).
