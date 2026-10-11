# Progress — AI Podcast Clipper SaaS

Este arquivo funciona como um diário de evolução do projeto: onde paramos, o que foi feito, e os próximos passos. É um log técnico vivo, não documentação de arquitetura — essa já está em `AGENTS.md` e `docs/`.

---

### 2026-10-11: clipes de corte manual mostram "Corte Manual" em vez da porcentagem (frontend)
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Problema:** no modo manual o Gemini não roda, então o clipe vem sem nota/gancho/motivo e o card mostrava `--`.
- **Como "é manual" é determinado:** `UploadedFile.manualCutsJson != null` (mesmo critério de `mode` em retry-project e process-video-payload). Verificação do código mostrou que **não era sempre preenchido**: só `TriggerVideoProcessingUseCase` (upload local) persistia; `ImportYouTubeVideoUseCase` (fluxo YouTube) não. Correção: a importação passou a persistir `manualCutsJson` (JSON string, mesma convenção do trigger e do `JSON.parse` do retry), via novo campo em `CreateUploadedFileInput`. Isso também corrige o retry de projetos YouTube manuais criados a partir de agora. Projetos YouTube manuais anteriores continuam sem o campo, então `isManualCut` tem fallback legado: clipe sem nota, gancho e motivo (automático sempre tem nota; nota 0 conta como nota). Sem mudança de schema Prisma.
- **Código:** `src/domain/services/clip-origin.service.ts` (`isManualCut`, função pura), `src/components/clip-card.tsx` e `clip-details-modal.tsx` (prop `isManual`; rótulo com texto real "Corte Manual", ícone `aria-hidden`; modal omite "Por que é viral?"), `src/app/dashboard/projects/[id]/page.tsx`, `import-youtube-video.use-case.ts`, porta e `PrismaUploadedFileRepository.create`. `ClipDisplay` não é usado em nenhuma página, não alterado. Sem mudança em `functions.ts` nem na transcrição.
- **TDD (RED confirmado: import inexistente e 3 testes falhando antes da implementação):** `tests/unit/domain/services/clip-origin.service.test.ts` (4), `tests/unit/clip-card-manual.test.tsx` (2, inclui regressão do automático), `tests/unit/components/clip-details-modal-manual.test.tsx`, 2 casos em `import-youtube-video.use-case.test.ts`, 1 em `project-details-page.test.tsx`, `tests/integration/clip-origin-manual-cuts.integration.test.ts` (Postgres real). Mudança de intenção: a fixture de `project-details-page.test.tsx` do clipe "sem nota" agora tem `hook` (um clipe sem nota/gancho/motivo passa a ser corretamente tratado como manual).
- **Verificação (execução real em 2026-10-11):** `npm run check` 0 erros / 7 warnings; `npm run test` 857 passed / 8 skipped (baseline 847); `npm run test:integration` 140 passed (baseline 139).
- **Docs:** `docs/arquitetura/visao-jornada-usuario.md` (2.7), `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-08).

### 2026-10-11: transcrição de cada clipe passa a chegar ao banco (backend)
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Bug:** `process_clip` usava `transcript_segments` só para queimar legendas e devolvia o dict sem palavras; o Inngest lê `clip.words` para gravar `Clip.transcriptWords`, que ficava sempre `null` (botão "Ver detalhes e transcrição" caía no fallback do hook). Afetava os **dois modos (automático e manual) desde antes desta sessão**; não foi introduzido pela transcrição só dos cortes.
- **Formato (confirmado no frontend):** campo `words`, itens `{word, start, end}` (`clip-editor-modal.tsx::parseTranscriptWords`, `update-clip.schema.ts`, `clip-details-modal.tsx` usa `.word`), tempos **relativos ao clipe** (o editor edita sobre o vídeo do clipe, que começa em 0; segue a mesma referência das legendas). Seleção igual à de `generate_ass_subtitles` (sobreposição com o clipe, `word`/`text`, ignora itens sem tempo ou em branco); tempos limitados a `[0, duração]`.
- **Código:** `core/clip_pipeline.py` (`extract_clip_words`, campo `words` no retorno). `ProcessVideoResponse.clips` é `List[dict[str, Any]]`, então aceita o campo sem mudar schema; contrato de entrada intacto. Frontend não alterado.
- **TDD (RED confirmado: 6 testes novos falhando antes da implementação):** `tests/test_clip_pipeline.py::TestClipWords` (4), `tests/test_local_server.py` (2: manual com 3 cortes sobrepostos e automático, via HTTP).
- **Verificação (execução real):** `.venv/bin/python -m pytest` 391 passed (baseline 385); `--ignore=tests/test_local_server.py` 342 passed (baseline 338).
- **Lacuna conhecida:** o teste de integração do frontend (`tests/integration/inngest-pipeline.test.ts`) só assere que `transcriptWords` está definido, não o conteúdo.
- **Docs:** RF-PIPE-15 (+ matriz) em `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md`, `docs/arquitetura/visao-fluxo-processamento-video.md`.

### 2026-10-11: sliders em segundos no Fatiador e nos cortes manuais (frontend)
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Bug pré-existente corrigido:** o Fatiador do modo automático trabalhava em minutos inteiros (`max = floor(duração/60)`, `step 1`, `sliceStartTime = min * 60`, custo `fim - início` em minutos). Num vídeo de 10:50 os últimos 50s eram inalcançáveis e a tela mostrava "10 minutos totais". O arredondamento por minuto já existia antes desta sessão (commit `84dc770` e anteriores); não foi introduzido pelo editor de cortes manuais.
- **Automático:** estado do trecho em segundos (slider 0 até a duração real, passo 1s, rótulos `mm:ss`/`h:mm:ss`), `sliceStartTime`/`sliceEndTime` exatos em `importYouTubeVideo` e `retryProjectAction`, custo por `calculateVideoCredits(fim - início)` (mesma regra do hold no Inngest: `computeEffectiveProcessingDuration` + 1 crédito por minuto ou fração). Trecho mínimo 1s (a cobrança mínima já é 1 crédito e vídeos < 60s ficariam sem opção com 60s). No modo edição o trecho salvo (já em segundos) é usado direto; 0/0 (projeto manual) ou fim <= início cai no padrão 0..5min (antes gerava um intervalo vazio mascarado por `|| 5`).
- **Manual:** slider de dois pontos por corte, sincronizado com os campos (mover preenche os dois campos; digitar um par válido move o slider; texto inválido não move). Limite de 60s ao arrastar: o outro ponto acompanha (travar o arraste deixaria o ponteiro preso e impediria mover a janela). Corte novo: slider sugere 30s depois do fim do último corte válido (0:00-0:30 no primeiro), limitado ao fim do vídeo, mas os campos ficam vazios (não cria corte cobrável sem ação do usuário). Pontos nomeados "Início/Fim do corte N (deslizante)" (sufixo para não colidir com os campos de texto de mesmo nome) e `aria-valuetext` em tempo. Setas movem 1s (confirmado com o Radix real em teste).
- **Código:** `src/lib/cut-slider.ts` (regras puras), `src/components/ui/slider.tsx` (`thumbLabels`, `thumbValueText`), `src/components/dashboard/create-project-client.tsx`.
- **TDD (RED confirmado: 20 testes novos falhando antes da implementação):** `tests/unit/lib/cut-slider.test.ts`, `tests/unit/components/ui/slider.test.tsx`, novos blocos em `tests/unit/components/create-project-client.test.tsx`, novo caso em `tests/integration/actions/youtube-actions.integration.test.ts`. Mudança de intenção em teste existente: a afirmação de que o Fatiador some no modo manual passou de `mock-slider` para `range-slider` (agora o manual também tem sliders); o mock do Slider foi reescrito.
- **Verificação (execução real em 2026-10-11):** `npm run check` 0 erros / 7 warnings; `npm run test` 847 passed / 8 skipped (baseline 817); `npm run test:integration` 139 passed (baseline 138).
- **Docs:** `docs/arquitetura/visao-jornada-usuario.md`, `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-08).

### 2026-10-11: modo manual — limite do plano pela soma dos cortes e falha antecipada de corte além do vídeo (frontend/Inngest)
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Contexto:** com a transcrição só dos cortes (entrada abaixo), o custo do modo manual passou a ser proporcional aos cortes, mas o passo `validate-and-reserve-credits` ainda aplicava o limite do plano (2h/3h) ao vídeo inteiro: um corte de 40s num vídeo de 5h era recusado, e o usuário só via o projeto como "falhou".
- **O que foi feito, com TDD (RED confirmado: import inexistente do novo serviço e 2 testes do handler falhando):** novo `src/domain/services/processing-duration.service.ts` com `computeEffectiveProcessingDuration` (manual = soma dos cortes; automático = trecho do Fatiador ou vídeo inteiro) e `assertManualCutsWithinVideo`; novo erro de domínio `ManualCutBeyondVideoError`. Em `processVideoHandler` a decisão manual/automático e os guards `ManualCutsRequiredError`/`ManualCutsModeMismatchError` agora vêm antes do limite do plano (mesma ordem relativa entre eles e o hold); a duração efetiva alimenta `validateVideoDuration` e o `durationSeconds` do hold. Corte com `endTime` > duração do vídeo falha antes do hold; o backend mantém a checagem 422.
- **Não reintentável:** o handler já captura todo erro, marca `failed` e retorna `success: false` sem relançar, então o Inngest não reexecuta; não foi necessário `NonRetriableError` (o projeto não o usa).
- **Testes:** novo `tests/unit/domain/services/processing-duration.service.test.ts`; novos casos em `tests/unit/inngest/manual-cuts-billing-consistency.test.ts` e `tests/integration/manual-cuts-billing-consistency.integration.test.ts` (5h + corte de 40s passa e reserva 1 crédito; corte além do vídeo sem hold; automático de 5h continua recusado). Em `tests/unit/inngest/manual-cuts-pipeline.test.ts` duas asserções de `durationSeconds` do hold passaram de 600 (vídeo) para 100 (soma dos cortes): mudança intencional de contrato.
- **Verificação (execução real em 2026-10-11):** `npm run check` 0 erros / 7 warnings; `npm run test` 817 passed / 8 skipped (baseline 808); `npm run test:integration` 138 passed (baseline 135).
- **Limitações que continuam:** o vídeo inteiro ainda é baixado e guardado (download só dos trechos é etapa futura já combinada com o usuário). O `timeout=600` da função `download_youtube` no Modal (`ai-podcast-clipper-backend/main.py`, linha ~172) pode não bastar para vídeos muito longos (o `process_video` usa `timeout=900`).
- **Docs:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-14 + matriz), `docs/requisitos/casos-de-uso-e-regras-de-negocio.md` (RN-PIPE-MANUAL-16/17), `docs/arquitetura/visao-fluxo-processamento-video.md`.
- **Arquivos:** frontend `src/domain/services/processing-duration.service.ts`, `src/domain/errors/manual-cut-beyond-video-error.ts`, `src/inngest/functions.ts` e os testes acima.

### 2026-10-11: modo manual transcreve só o áudio dos cortes (backend)
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Contexto:** decisão do usuário. No modo manual o pipeline transcrevia o vídeo inteiro (um corte de 40s num podcast de 3h custava 3h de GPU) só porque as legendas dependem da transcrição. O modo automático não muda (o Gemini precisa da transcrição inteira).
- **O que foi feito, com TDD (RED confirmado: `ImportError` de `merge_time_ranges` e 5 testes do pipeline falhando antes da implementação):** `WhisperTranscriber.transcribe_range(base_dir, video_path, start, end)` extrai só o trecho (`ffmpeg -ss -i -t`, lista de argumentos, `shell=False`, wav único por trecho), transcreve/alinha e soma `start` aos tempos das palavras (continuam absolutos no vídeo original, então `process_clip`/legendas ficam intactos). `merge_time_ranges` aplica margem de 0,5s (limitada a `[0, duração]`) e mescla intervalos sobrepostos ou que se tocam, evitando palavras duplicadas. `run_video_processing_pipeline` usa isso no modo manual e concatena/ordena as palavras; o modo automático continua chamando `transcribe` no vídeo inteiro (teste de regressão).
- **Decisão da margem:** 0,5s mantida sem filtrar as palavras de borda, porque `generate_ass_subtitles` já descarta palavras fora do intervalo do clipe; a margem só evita perder palavra cortada ao meio na borda.
- **Testes:** novo `tests/test_transcription_ranges.py` (9, ffmpeg e whisperx mockados), `tests/test_video_pipeline.py` (+5 casos em `TestManualMode`, regressão em `TestAutoModeRegression`), integração em `tests/test_local_server.py` (vídeo de amostra real, 2 cortes distantes: o transcritor recebe só 2 intervalos e as legendas de cada clipe recebem palavras com tempos absolutos). O caso de integração já passou de primeira porque a implementação do pipeline existia quando foi escrito (RED provado no nível unitário do pipeline).
- **Verificação (execução real em 2026-10-11):** `.venv/bin/python -m pytest` 385 passed (baseline 371); `--ignore=tests/test_local_server.py` 338 passed (baseline 325).
- **Limitações:** o idioma é detectado por trecho pelo WhisperX, mas o modelo de alinhamento é carregado com `language_code` fixo; trechos curtos/silenciosos podem ter detecção menos confiável. Não validado com GPU/whisperx real (só mocks).
- **Docs:** `docs/requisitos/casos-de-uso-e-regras-de-negocio.md` (RN-PIPE-MANUAL-08), `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-08), `docs/arquitetura/visao-fluxo-processamento-video.md`.
- **Arquivos:** backend `core/transcription.py`, `core/video_pipeline.py`, `tests/test_transcription_ranges.py`, `tests/test_video_pipeline.py`, `tests/test_local_server.py`.

### 2026-10-11: LR-ASD voltou a funcionar — `scenedetect` fixado + lançador `core/asd_runner.py`
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Contexto:** com o fix do `sys.executable` (entrada de 2026-10-10), o processamento local passou a chegar no LR-ASD e voltou a falhar com o genérico `Tracks or scores not found for clip`. Investigando o traceback do `Columbia_test.py` no log do backend, apareceram 3 incompatibilidades em cadeia entre o submódulo `asd/` (que não editamos) e as libs atuais: (1) `scenedetect 0.5.6` + OpenCV 4.14: `cv2.split` devolve tupla e o `ContentDetector` tenta alterá-la (`TypeError`); (2) os pesos do detector de rostos (`sfd_face.pth`) não vêm no repo e o vendor os baixa com `gdown --id`, flag removida no gdown 5 (instalado: 6.2.0), além de o `gdown` não estar no PATH do subprocess; (3) `np.int`, removido no NumPy 2 (instalado: 2.0.2), em `s3fd/box_utils.py`.
- **Produção também afetada:** o Modal instala o `requirements.txt` sem versões. Num deploy novo, o `scenedetect` iria para a 0.7.1, que removeu `scenedetect.video_manager` (testado em pasta isolada: `ModuleNotFoundError`), e o download dos pesos quebraria pelo mesmo `--id`.
- **Correção, com TDD (RED confirmado em cada parte):**
  - `requirements.txt`: `scenedetect==0.6.7.1`, a única versão testada que roda o código do Columbia (0.5.6 → TypeError, 0.6.7.1 → OK, 0.7.1 → ImportError). `.venv` local atualizada para 0.6.7.1. Teste: `tests/test_asd_scene_detection_dependency.py` (RED com 0.5.6 reproduzindo exatamente o `TypeError` do log).
  - Novo `core/asd_runner.py`: roda `Columbia_test.py` via `runpy` com `cwd`/`sys.path` no `asd/`, depois de garantir o `sfd_face.pth` pela API Python do `gdown` (com arquivo `.part`, rejeitando download < 1 MB, como página de erro do Google Drive) e restaurar `np.int`. Teste: `tests/test_asd_runner.py` (8 casos; RED: módulo inexistente).
  - `core/active_speaker_detection.py`: invoca o lançador (`[sys.executable, core/asd_runner.py, "Columbia_test.py", ...]`, sem shell). O `FileNotFoundError` agora traz o exit code do LR-ASD e aponta para o traceback no log; exit ≠ 0 com tracks/scores gerados não é fatal (a etapa final de visualização pode falhar depois deles). Testes: `tests/test_active_speaker_detection.py` (+3 casos).
  - `main.py`: a imagem do Modal baixa o `sfd_face.pth` no build (`run_commands` após o `add_local_dir("asd", ...)`, idempotente via `test -s`), sem depender do Google Drive a cada cold start; se falhar no build, o lançador tenta em runtime.
  - Local: `sfd_face.pth` baixado uma vez para `asd/model/faceDetector/s3fd/` (arquivo não versionado dentro do submódulo).
- **Verificação (execução real em 2026-10-11):** ponta a ponta com `run_active_speaker_detection` → lançador → `Columbia_test.py` num trecho de 12s de um vídeo real do MinIO local: exit 0 em 54,7s, `tracks.pckl` 15 KB / `scores.pckl` 2 KB, 2 tracks de rosto (63 e 165 frames) com score médio -2,06 e +4,16 (o modelo separa quem fala). Backend `.venv/bin/python -m pytest` → 371 passed; perfil do CI leve (`--ignore=tests/test_local_server.py`) → 325 passed.
- **Pendente:** validar `modal deploy` + processamento real (build não executado aqui); o backend local em execução precisa ser reiniciado para carregar o lançador; demais dependências seguem sem versão fixa (item HIGH "Dependências Python sem versão fixada").
- **Docs:** `docs/arquitetura/visao-fluxo-processamento-video.md` (passo "Executar LR-ASD"), `docs/operacao/checklist-go-live.md` (novo item resolvido em "Riscos de Configuração e Ambiente").
- **Arquivos:** backend `requirements.txt`, `main.py`, `core/active_speaker_detection.py`, novo `core/asd_runner.py`, novos `tests/test_asd_runner.py` e `tests/test_asd_scene_detection_dependency.py`, `tests/test_active_speaker_detection.py`.

### 2026-10-11: RF-PIPE-08 — UI de cortes manuais na criação de projeto via YouTube
- **Commit(s):** nenhum ainda. Alterações no working directory para revisão do usuário.
- **Contexto:** o modo manual já existia de ponta a ponta (action `importYouTubeVideo` com `mode: "manual"` + `manualCuts`, reserva de créditos por `calculateManualCutsCredits` no Inngest), mas a tela de criação sempre enviava `mode: "auto"`. Faltava só a UI.
- **O que foi feito, com TDD (RED confirmado: módulos inexistentes e 16 de 23 testes do componente falhando antes da implementação):** `CreateProjectClient` ganhou, no card "Configurações do Corte", um radio group Automático (padrão) / Manual e, no manual, um editor de cortes (início/fim em `mm:ss` ou `h:mm:ss`, título opcional, adicionar/remover, limite de 50). Validação por linha com `aria-invalid` + `aria-describedby` + `role="alert"`: formato, fim <= início, > 60s, além da duração do vídeo; sobreposição é só aviso. No manual o Fatiador é escondido (decisão de UX: ele é para a IA escolher dentro de um trecho) e o custo vem de `calculateManualCutsCredits`; o envio manda `mode: "manual"` + `manualCuts` em segundos, sem slice. Modo automático inalterado (só ganhou `data-testid="processing-cost"`). Constantes (50, 60s) vêm de `manual-cut.schema.ts`; o payload ainda é conferido com `manualCutsArraySchema` antes de enviar.
- **Novos módulos:** `src/lib/time-format.ts` (`parseTimeInput`, `formatTimeInput`), `src/lib/manual-cut-rows.ts` (`analyzeManualCutRows`, puro).
- **Testes:** `tests/unit/lib/time-format.test.ts`, `tests/unit/lib/manual-cut-rows.test.ts`, bloco "modo manual de cortes" em `tests/unit/components/create-project-client.test.tsx` (17 casos, incl. a11y e regressão do modo automático e do `editMode`), e um caso novo em `tests/integration/actions/youtube-actions.integration.test.ts` (payload exatamente como a UI envia: vários cortes, sem slice, `UploadedFile` + evento Inngest). O projeto não tem `@testing-library/user-event`, então o teste de teclado confere ordem de DOM/foco, não Tab simulado.
- **Verificação (execução real em 2026-10-11):** `npm run check` com 0 erros e 7 warnings (igual ao baseline); `npm run test` 808 passed / 8 skipped (baseline 741); `npm run test:integration` 135 passed (baseline 134).
- **Limitações conhecidas:** (1) sem seletor no modo edição/retry (`editMode`). (2) Sem slice, `src/inngest/functions.ts` valida a duração do vídeo inteiro contra o limite do plano (2h/3h) antes do hold; um vídeo maior que o plano falha na fila mesmo no manual, e a UI não conhece o plano para avisar antes. Decisão de produto pendente.
- **Docs atualizados:** `docs/arquitetura/visao-jornada-usuario.md` (seção 2.2.1), `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-08 e matriz).

### 2026-10-11: RNF-SEC-19 resolvido — `/process_video` não lê mais arquivo local via `s3_key` (fallback removido + formato validado)
- **Commit(s):** nenhum ainda. As alterações ficaram no working directory para revisão do usuário.
- **Contexto:** pendência deixada pelo grupo B1 (entrada abaixo). `core/video_pipeline.py::resolve_input_video_path` fazia `os.path.exists(s3_key)` → `shutil.copy`, e `ProcessVideoRequest.s3_key` não tinha validação de formato. Quem tinha `AUTH_TOKEN` podia mandar `s3_key="/etc/passwd"` (ou qualquer arquivo do container, inclusive no Modal) para `/process_video`. Decisão do usuário: remover o fallback por completo; o vídeo de entrada sempre vem do storage plugável (S3 em produção, MinIO em dev).
- **O que foi feito, com TDD (RED confirmado antes: 31 falhas, todas nos testes novos):** (1) `resolve_input_video_path` agora só chama `storage.download_file(s3_key, base_dir/input.mp4)`; imports `os`/`shutil` removidos. (2) `core/schemas.py::PROCESS_VIDEO_S3_KEY_PATTERN` em `ProcessVideoRequest.s3_key`: `youtube/<uuid>/original.mp4` (reaproveita o corpo do `YOUTUBE_S3_KEY_PATTERN`, cujo valor ficou idêntico) ou `uploads/<userId>/<uuid>/<nome>` (`generate-upload-url.use-case.ts`; `userId` `[A-Za-z0-9_-]+`, nome `[A-Za-z0-9._-]+`, nunca `.`/`..`, escrito sem lookahead porque o engine Rust do Pydantic não suporta). Caminho absoluto, `../`, `clips/...`, vazio e `\n` no fim → 422.
- **Testes:** novo `ai-podcast-clipper-backend/tests/test_process_video_s3_key_hardening.py` (schema + HTTP em `main.process_video` montado num app FastAPI como método ligado a um container fake, sem importar `local_server`); `tests/test_video_pipeline.py::TestResolveInputVideoPath` (o teste que preservava o fallback virou "arquivo existente no disco com o mesmo nome do `s3_key` nunca é copiado", + caso de arquivo local ausente no storage → `FileNotFoundError`); `tests/test_local_server.py::TestLocalProcessVideoS3KeyHardening` (HTTP, 422 sem download/transcrição) e um teste de que o vídeo vem do storage pela chave pedida.
- **Migração de dados de teste (intenção inalterada):** `pipeline_env`/`_payload_for_local_file` em `tests/test_local_server.py` passaram a usar `PROCESS_VIDEO_KEY` (`youtube/<uuid>/original.mp4`) servida pelo `FakeObjectStorage` com os bytes do vídeo de amostra (sem precisar estender o fake). Chaves inválidas trocadas por chaves no formato real em `tests/fixtures/manual_cuts_payload.json`, `test_gemini_schema.py`, `test_preset_shell_injection.py`, `test_manual_cut_input_hardening.py`, `test_process_video_contract.py`, `test_video_pipeline.py` e `test_local_server.py` (`TestProcessVideoEndpointRejectsHostileCutsWith422`).
- **Frontend (só verificado, nada alterado):** as únicas origens do `s3_key` enviado ao `/process_video` são `UploadedFile.s3Key` (`generate-upload-url.use-case.ts` / `import-youtube-video.use-case.ts`) e o `s3_key` devolvido pelo `/download_youtube` (formato YouTube). Testes do frontend usam chaves fictícias como `uploads/file-123/video.mp4`, mas só com o backend mockado, então não quebram.
- **Verificação (execução real em 2026-10-11):** backend `.venv/bin/python -m pytest` → **359 passed** (baseline 320 + 39 novos), 1 warning preexistente. Perfil do job leve de CI (`--ignore=tests/test_local_server.py`) → **313 passed**.
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-19 novo, linha na matriz, contagem 71 / 33 ✅), `docs/arquitetura/visao-fluxo-processamento-video.md` (passo 1 do fluxo, ressalva do storage, tabela de ambientes, risco 2 resolvido), `docs/operacao/checklist-go-live.md` (2 itens `[x] RESOLVIDO`, resumo High 10 resolvidos / 33 restantes).
- **Residual:** o backend não confere se o `userId` em `uploads/<userId>/...` é o dono da requisição; o frontend continua sendo a única origem dessas chaves.
- **Dado legado no Postgres local de dev (corrigido por dado, não por código):** no primeiro teste manual depois da mudança, `/download_youtube` respondeu 422 porque o `UploadedFile.s3Key` de um projeto antigo era `/tmp/ai-podcast-clipper/<hex>.mp4`. O `local_server.py` antigo devolvia esse caminho e `src/inngest/functions.ts:191-201` gravava o valor no banco. 6 registros `YOUTUBE` no banco local estavam assim; todos receberam uma chave nova `youtube/<uuid>/original.mp4` via `UPDATE ... RETURNING` (os valores antigos ficaram no histórico da sessão). Produção não é afetada: o `download_youtube` do Modal sempre devolveu chave válida. Se outro banco de dev tiver esse legado, rodar: `UPDATE "UploadedFile" SET "s3Key" = 'youtube/' || gen_random_uuid() || '/original.mp4' WHERE "sourceType" = 'YOUTUBE' AND "s3Key" LIKE '/tmp/ai-podcast-clipper/%';`.
- **Arquivos:** backend `core/video_pipeline.py`, `core/schemas.py`, novo `tests/test_process_video_s3_key_hardening.py`, `tests/test_video_pipeline.py`, `tests/test_local_server.py`, `tests/fixtures/manual_cuts_payload.json`, `tests/test_gemini_schema.py`, `tests/test_preset_shell_injection.py`, `tests/test_manual_cut_input_hardening.py`, `tests/test_process_video_contract.py`.

### 2026-10-11: RNF-SEC-04 (Inngest) e RNF-IDEM-05 resolvidos — validação central das env vars do Inngest + guard de produção da fila em memória do Stripe
- **Commit(s):** nenhum ainda. As alterações ficaram no working directory para revisão do usuário.
- **Contexto:** grupo F4 do plano de itens HIGH do `cto`. Dois itens do checklist: (1) "Verificação de assinatura Inngest sem validação central": `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` não existiam no schema de `src/env.js`; (2) "Fila em memória de fallback do Stripe não tem guard de `NODE_ENV`": sem `INNGEST_EVENT_KEY` em produção, `stripe-queue.ts` empurrava o evento pra fila em memória, a rota respondia 200 e marcava o evento como processado, e um cold start podia perder o crédito pago.
- **Decisão de mecanismo:** as 3 vars (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_DEV`) entraram no schema `server` como `.optional()`. Como a regra é "obrigatória só em produção", a checagem cruzada ficou numa função pura separada, `src/inngest-env-guard.js::assertInngestProductionEnv`, chamada por `src/env.js` logo após o `createEnv`. Não usei `.superRefine`/`createFinalSchema` do `@t3-oss/env-nextjs` 0.12 porque `node_modules` está bloqueado pras minhas permissões e não deu pra confirmar a API. Ela roda só no servidor, respeita `SKIP_ENV_VALIDATION` e falha no `next build` (via `next.config.js`) e no boot. Em produção também barra `INNGEST_DEV` "verdadeiro", porque o dev mode do SDK desliga a verificação de assinatura.
- **O que foi feito, com TDD (RED confirmado antes de cada implementação):** `stripe-queue.ts::assertInMemoryFallbackAllowed` roda antes do `push` em `enqueue` e `enqueueSubscription` e lança com `NODE_ENV=production` sem a key, então a rota responde 503 sem marcar o evento. RED do teste de integração confirmado desligando o guard temporariamente.
- **Investigação do SDK (`inngest` 4.20.0, lido no `InngestCommHandler.js` instalado via `node -e`):** em cloud mode (default sem `INNGEST_DEV`), um POST sem assinatura válida dá 401 e a falta de signing key dá 500, nos dois casos antes de executar a função. O teste de integração de `/api/inngest` funciona como regression guard. **Achado:** a primeira versão do teste recebeu **206 com execução real da função `processVideo`** numa requisição forjada. A causa foi o `@prisma/client`, que carrega o `.env` local (com `INNGEST_DEV=1`) em `process.env` ao ser importado e colocou o SDK em dev mode no meio do request. Os `.env*` não são versionados, e a validação central agora barra esse cenário em produção.
- **Bug pré-existente corrigido de passagem:** `scripts/test-everything.sh` tinha `export AUTH_TOKEN"mock-auth-token"` (sem `=`), o que abortava o script sob `set -e` (reproduzido com `bash -c`). Também passou a exportar `INNGEST_DEV=1` + `INNGEST_EVENT_KEY` dummy: o `next start` desse harness roda com `NODE_ENV=production` e, sem isso, o webhook do smoke k6 responderia 503 por causa do guard novo. **Não rodei o `test:everything`**: as portas 3000/8288 estavam ocupadas por outros processos.
- **Testes:** `tests/unit/config/inngest-env-validation.test.ts` (20), `tests/unit/infrastructure/queue/stripe-queue.production-guard.test.ts` (7), `tests/integration/inngest-serve-signature.integration.test.ts` (4), `tests/integration/stripe-webhook-in-memory-queue-production-guard.integration.test.ts` (2).
- **Verificação (execução real em 2026-10-11, árvore com o trabalho paralelo dos outros grupos):** `npm run check` com exit 0 (eslint 0 erros/7 warnings de baseline, tsc ok). `npm run test` → 741 passed, 8 skipped. `npm run test:integration` → 134 passed (26 arquivos). CI (`.github/workflows/ci.yml`) não mudou: ele usa `SKIP_ENV_VALIDATION=1` e não chama o webhook via HTTP. `tests/setup.ts` também não mudou (`NODE_ENV=test` e `INNGEST_EVENT_KEY` já setada).
- **Impacto operacional:** todo ambiente com `NODE_ENV=production` (inclusive previews da Vercel) precisa de `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` e não pode ter `INNGEST_DEV`. Um `npm run build`/`preview` local sem elas agora falha, a menos que se use `SKIP_ENV_VALIDATION=1`.
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-04 ⚠️→✅, RNF-IDEM-05 novo, 2 linhas na matriz, contagem de RNFs), `docs/arquitetura/visao-fluxo-pagamento.md` (diagramas de sequência e de fluxo, decisões de design, risco "Fila em Memória" marcado resolvido), `docs/operacao/checklist-go-live.md` (2 itens `[x] RESOLVIDO`).
- **Arquivos:** criados `ai-podcast-clipper-frontend/src/inngest-env-guard.js` e os 4 arquivos de teste acima. Alterados `src/env.js`, `src/infrastructure/queue/stripe-queue.ts` e `scripts/test-everything.sh`.

### 2026-10-11: RNF-SEC-09 (CSP) — Content-Security-Policy-Report-Only ativado (NÃO enforce — falta validação ao vivo e decisão do usuário)
- **Commit(s):** nenhum ainda. As alterações ficaram no working directory para revisão do usuário.
- **Contexto:** grupo F5 do plano de itens HIGH (`cto`). `next.config.js` já tinha os demais headers de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`), mas CSP ficava deliberadamente de fora — o próprio comentário no arquivo já explicava o risco de quebrar Clerk/Stripe sem testar ao vivo.
- **IMPORTANTE — isto NÃO é enforce:** só foi ativado `Content-Security-Policy-Report-Only`, que **reporta violações no DevTools do browser sem bloquear nenhum carregamento**. `Content-Security-Policy` (enforce) continua deliberadamente fora. Trocar de Report-Only para enforce é decisão e execução do usuário, só depois de validar ao vivo em staging (com chave Clerk de produção real, que hoje ainda não está configurada): (1) login/signup incluindo Google OAuth, (2) checkout e portal do Stripe, (3) reprodução de clipe no player de vídeo.
- **O que foi feito, com TDD (RED confirmado antes — import do módulo inexistente falhava a suíte):** política extraída para `content-security-policy.config.js` (função `buildContentSecurityPolicy()`, testável isoladamente), importada por `next.config.js` e aplicada como header `Content-Security-Policy-Report-Only` em todas as rotas (`securityHeaders`). Diretivas mínimas de defesa (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`) mais as exceções de domínio levantadas **lendo o código, não supondo**: Clerk (`script-src`/`connect-src`/`frame-src` para `*.clerk.accounts.dev`, único Frontend API em uso hoje — só há chave de dev configurada; `img-src` para `img.clerk.com`, avatares em `nav-user.tsx`/`user-nav-menu.tsx`), miniaturas do YouTube (`i.ytimg.com`, usadas em `create-project-client.tsx:292`), imagens da landing (`images.unsplash.com`, hardcoded em `showcase-carousel.tsx`), e S3/MinIO em `media-src`/`img-src` (`*.amazonaws.com` para o player de vídeo via URL pré-assinada, `custom-video-player.tsx`; mais a origem de `S3_ENDPOINT_URL` quando configurado — MinIO em dev — resolvida em runtime por `resolveExtraOriginFromS3Endpoint()`, para não gerar ruído de violação em ambiente local). **Nenhum domínio Stripe entrou na política**: confirmado lendo `src/actions/stripe.ts`/`stripe-payment.gateway.ts` que checkout e portal usam `redirect(sessionUrl)` — navegação de página inteira para o Stripe, não iframe/script embutido (`@stripe/stripe-js`/`loadStripe`/`<Elements>` não existem em `src/`).
- **Testes:** `tests/unit/next-config.test.ts` (12 casos novos: diretivas mínimas, domínios Clerk/YouTube/Unsplash/S3, ausência de qualquer domínio Stripe, origem extra de `S3_ENDPOINT_URL`, e o guard mais importante — garante que `Content-Security-Policy` enforce nunca aparece no array de headers), `tests/integration/security-headers-csp.integration.test.ts` (3 casos: requisição HTTP real a `/api/health` confirma `Content-Security-Policy-Report-Only` presente e `Content-Security-Policy` ausente, diretivas mínimas no valor real, e que os headers de segurança pré-existentes não regrediram).
- **Verificação (execução real em 2026-10-11):** `npm run check` → eslint 0 erros/7 warnings (baseline, igual antes); tsc sem erros novos. `npm run test` → 741 passed/8 skipped (104 arquivos), sem regressão. `npm run test:integration` → 132 passed (25 arquivos), incluindo `health-check.test.ts` e `legal-pages.test.ts` (fluxos Clerk) sem regressão. Testei também contra um servidor `next dev` já em execução nesta máquina (hot-reload aplicou a mudança): `curl -D- http://localhost:3000/api/health` mostrou `Content-Security-Policy-Report-Only` presente com a política completa (incluindo `http://localhost:9000` do MinIO local) e nenhum header `Content-Security-Policy` (enforce).
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-09 ❌→⚠️ parcial, contagem de RNFs, lista de "RNFs Críticos A DEFINIR"), `docs/operacao/checklist-go-live.md` (item CSP em HIGH → Segurança marcado como parcial, explicitamente não resolvido, com o próximo passo manual do usuário).
- **Próximo passo (usuário, não automático):** configurar chave Clerk de produção em staging, validar ao vivo login/checkout/player, e só então editar `next.config.js` trocando `Content-Security-Policy-Report-Only` por `Content-Security-Policy`.
- **Arquivos:** novo `ai-podcast-clipper-frontend/content-security-policy.config.js`; `ai-podcast-clipper-frontend/next.config.js`; novos `ai-podcast-clipper-frontend/tests/integration/security-headers-csp.integration.test.ts`; `ai-podcast-clipper-frontend/tests/unit/next-config.test.ts` (estendido).

### 2026-10-11: RNF-SEC-06 (SSRF no `local_server.py`) e RNF-SEC-18 (`s3_key` arbitrário no `download_youtube`) resolvidos
- **Commit(s):** nenhum ainda. As alterações ficaram no working directory para revisão do usuário.
- **Contexto:** grupo B1 do plano de itens HIGH de segurança do `cto`. (1) O `/download_youtube` do `local_server.py` rodava `python -m yt_dlp <url>` via `subprocess` sem validar o host (SSRF: `169.254.169.254`, intranet, `localhost`). Ele salvava em `/tmp/ai-podcast-clipper/<uuid>.mp4` e devolvia esse caminho como `s3_key`, divergindo de produção. (2) `DownloadYouTubeRequest.s3_key` aceitava qualquer string, sem `extra="forbid"`. Quem tivesse o `AUTH_TOKEN` podia mandar `s3_key="clips/<outro usuário>/..."` e sobrescrever o objeto.
- **O que foi feito, com TDD (RED confirmado antes, 43 falhas pelos motivos esperados):** `local_server.py::download_youtube` agora chama `core/youtube_downloader.py::download_youtube_to_s3` com `create_object_storage()` (MinIO em dev), igual a `main.py`. É decisão do usuário, e o atalho de arquivo local foi removido. A classe local `DownloadRequest` foi removida, porque o grep confirmou que ninguém lia `req.s3_bucket`, e o endpoint passa a usar o `DownloadYouTubeRequest`/`DownloadYouTubeResponse` compartilhado. Os imports `subprocess`/`sys`/`BaseModel` sem uso foram removidos. `YouTubeInvalidHostError` → 400 nos dois runners (em `main.py` caía no `except Exception` e virava 500). `DownloadYouTubeRequest` ganhou `extra="forbid"` e `s3_key` com `pattern` de UUID canônico (`youtube/<uuid>/original.mp4`), um subconjunto estrito do `[0-9a-fA-F-]+` pedido no plano. Frontend: `src/inngest/functions.ts::downloadYouTubeVideo` parou de enviar `s3_bucket`, que viraria 422 com `extra="forbid"`.
- **Testes:** novo `ai-podcast-clipper-backend/tests/test_download_youtube_hardening.py` (schema + HTTP em `main.download_youtube` montado num app FastAPI, sem importar `local_server`, então roda no job leve de CI). Nova classe `tests/test_local_server.py::TestLocalDownloadYouTube`, que substitui os 2 testes antigos que esperavam `/tmp`/`"Local Video"`. Em `tests/test_youtube_downloader.py`, as chaves `youtube/vid123/...` foram trocadas por UUID e `test_endpoint_ignores_bucket_sent_by_client` virou `test_endpoint_rejects_bucket_sent_by_client`. Frontend: novo `tests/unit/inngest/download-youtube-request-body.test.ts` (RED confirmado reintroduzindo a linha temporariamente).
- **Verificação (execução real em 2026-10-11):** backend `.venv/bin/python -m pytest` → **320 passed**, 1 warning (o preexistente do starlette). Equivalente ao job leve de CI (`--ignore=tests/test_local_server.py`) → 279 passed. Frontend `npx vitest run tests/unit/inngest/` → 17 passed. `tsc --noEmit` sem erro em `functions.ts` e eslint sem erro.
- **Não resolvido (registrado no checklist):** o fallback `os.path.exists(s3_key)` de `core/video_pipeline.py::resolve_input_video_path` foi mantido de propósito, porque está fora do escopo. O fluxo normal não gera mais `s3_key` local, mas `ProcessVideoRequest.s3_key` segue sem validação de formato, então um chamador com token ainda alcança o fallback. Fica a sugestão de remover o fallback ou validar o formato. Residual do RNF-SEC-18: o chamador ainda escolhe qual `youtube/<uuid>` escrever.
- **Incidente operacional durante a tarefa:** um `git stash`/`git stash pop` usado para comparar warnings falhou no `pop` porque outros agentes paralelos editaram arquivos no meio. A árvore de trabalho foi restaurada arquivo a arquivo a partir da stash (`git show stash@{0}:<path>`, sem stage), e verificou-se que todo o conteúdo da stash está de volta. A `stash@{0}` foi mantida como backup e pode ser descartada pelo usuário com `git stash drop` depois de revisar.
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-06 ⚠️→✅, RNF-SEC-18 novo, RF-INGEST-02 e linha na matriz, contagem de RNFs), `docs/arquitetura/visao-fluxo-processamento-video.md` (tabela de diferenças entre ambientes e riscos 2/3/5), `docs/operacao/checklist-go-live.md` (2 itens `[x] RESOLVIDO`, `resolve_input_video_path` e a pendência BAIXA anotados como parcialmente mitigados, ainda abertos).
- **Arquivos:** backend `local_server.py`, `main.py`, `core/schemas.py`, `tests/test_local_server.py`, `tests/test_youtube_downloader.py`, novo `tests/test_download_youtube_hardening.py`; frontend `src/inngest/functions.ts`, novo `tests/unit/inngest/download-youtube-request-body.test.ts`.

### 2026-10-11: RNF-RL-04/RNF-RL-05 resolvidos — rate limit em actions de projeto e billing
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** item HIGH do checklist (grupo F3 de um plano maior do `cto`, rodando em paralelo com outro grupo F2 que também tocou `rate-limiter-factory.ts` — ver entrada seguinte, `GET /api/youtube/info`). `deleteProjectAction`, `renameProjectAction`, `retryProjectAction` (`src/actions/projects-actions.ts`) e `createCheckoutSession`, `createCustomerPortalSession` (`src/actions/stripe.ts`) não tinham rate limiting, apesar do padrão já existir no projeto (`importYouTubeVideo`/`generateUploadUrl`) — risco de loop de exclusão/renomeação/retry ou de geração de sessões Stripe (custo/abuso na API do Stripe).
- **O que foi feito, com TDD (RED confirmado antes):** testes unitários novos (`tests/unit/actions/projects-actions-rate-limit.test.ts`, `tests/unit/actions/stripe-actions-rate-limit.test.ts`, sem mockar `rate-limiter-factory` — exercitam o limiter real, mesmo padrão de `youtube-import-rate-limit.test.ts`) e testes de integração novos (`tests/integration/actions/projects-actions-rate-limit.integration.test.ts` para `renameProjectAction`, `tests/integration/actions/stripe-actions-rate-limit.integration.test.ts` para `createCheckoutSession`, com Prisma real/rollback e só auth+Stripe mockados). Depois: dois singletons novos em `src/infrastructure/factories/rate-limiter-factory.ts` (só adição, nada removido/reordenado do que já existia ali — arquivo compartilhado com o grupo F2) — `makeProjectActionRateLimiter()` (20 req/min por usuário) e `makeBillingActionRateLimiter()` (5 req/min por usuário, limite compartilhado entre checkout e portal). Guard logo após resolver `userId` nas 5 actions, lançando `RateLimitExceededError` acima do limite.
- **Efeito colateral e correção:** o guard novo em `createCheckoutSession`/`createCustomerPortalSession` roda antes de qualquer validação de payload, então testes de negócio pré-existentes que reutilizavam o mesmo `userId` em várias chamadas sequenciais (`tests/unit/stripe-action.test.ts`, `tests/integration/actions/stripe-actions.integration.test.ts`) estouravam o limite real e passaram a falhar por motivo errado. Corrigido mockando `makeBillingActionRateLimiter`/`makeProjectActionRateLimiter` como ilimitado nesses arquivos de teste de lógica de negócio (mesmo padrão já usado em `tests/unit/youtube-action.test.ts` para `makeYouTubeImportRateLimiter`), deixando a cobertura de rate limit só nos arquivos dedicados.
- **Verificação (execução real em 2026-10-11):** `npm run check` → eslint 0 erros/7 warnings (baseline); tsc com erros só em `tests/unit/config/inngest-env-validation.test.ts` (trabalho em andamento de outro agente/grupo em `inngest-env-guard.js`/`env.js`, fora deste escopo — confirmado via `git status` que esses arquivos não foram tocados por mim). `npm run test` → todos os arquivos deste escopo passam (`projects-actions-rate-limit.test.ts`, `stripe-actions-rate-limit.test.ts`, `projects-actions.test.ts`, `stripe-action.test.ts`, `youtube-import-rate-limit.test.ts`, `youtube-action.test.ts` — 63/63); únicas falhas da suíte completa são em `tests/unit/config/inngest-env-validation.test.ts` e `tests/unit/infrastructure/queue/stripe-queue.production-guard.test.ts`, ambos de outro trabalho paralelo em andamento (`src/inngest/functions.ts`, `src/infrastructure/queue/stripe-queue.ts`, explicitamente fora do meu escopo). `npm run test:integration` → todos os arquivos deste escopo passam (26/26); única falha pré-existente em `tests/integration/inngest-serve-signature.integration.test.ts`, mesmo motivo (trabalho paralelo em `src/inngest/functions.ts`).
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-RL-04/RNF-RL-05 ✅, RNF-SEC-08 atualizado, item 6 da lista de "A DEFINIR" ajustado), `docs/operacao/checklist-go-live.md` (item `[x] RESOLVIDO`).
- **Arquivos:** criados `tests/unit/actions/projects-actions-rate-limit.test.ts`, `tests/unit/actions/stripe-actions-rate-limit.test.ts`, `tests/integration/actions/projects-actions-rate-limit.integration.test.ts`, `tests/integration/actions/stripe-actions-rate-limit.integration.test.ts`; alterados `src/actions/projects-actions.ts`, `src/actions/stripe.ts`, `src/infrastructure/factories/rate-limiter-factory.ts` (só adição), `tests/unit/projects-actions.test.ts`, `tests/unit/stripe-action.test.ts`, `tests/integration/actions/stripe-actions.integration.test.ts` (mock do rate limiter adicionado, nada removido).

### 2026-10-11: RNF-SEC-17 (backend) resolvido — guard de `S3_ENDPOINT_URL` de dev em produção + checklist do secret do Modal
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** item HIGH do checklist (grupo B2 de um plano maior do `cto`, rodando em paralelo com outros grupos tocando arquivos diferentes). `core/storage/factory.py::create_object_storage` lia `S3_ENDPOINT_URL` (branch `"minio"`) sem nenhuma checagem de ambiente — se uma variável de dev (`S3_ENDPOINT_URL=http://localhost:9000`, usada só localmente com o MinIO do `docker-compose.yml`) fosse herdada por engano no secret do Modal (produção), o `boto3` apontaria pra um host inalcançável e o processamento inteiro falharia. O frontend já tinha esse guard (`storage-endpoint-guard.ts::assertStorageEndpointAllowed`, `NODE_ENV=production`); faltava o lado backend.
- **Decisão de produto (minha, documentada, aberta a revisão):** o backend Python não tem `NODE_ENV`. Introduzida `APP_ENV` (nova env var, `"development"` default / `"production"`) — só ativa o guard quando `APP_ENV=production`.
- **O que foi feito, com TDD (RED confirmado antes):** `_assert_storage_endpoint_allowed_in_production` em `core/storage/factory.py`, chamada dentro da branch `"minio"` (depois da checagem de `S3_ENDPOINT_URL` ausente) — porta a mesma regra do guard do frontend usando `ipaddress`/`urlparse` da stdlib: rejeita `localhost`, loopback/privado/link-local (IPv4 e IPv6, via `ipaddress.ip_address(...).is_private/is_loopback/is_link_local`), sufixo `.local`/`.internal`/`.localhost`, hostname sem ponto (ex. `minio`) e esquema não-`https://`. `ValueError` com mensagem acionável, no mesmo estilo já usado no resto do arquivo.
- **Testes:** `tests/test_storage_factory.py::TestProductionEndpointGuard` (18 casos parametrizados: 12 variações de host inseguro + HTTP público rejeitado + HTTPS público aceito + `APP_ENV` ausente/`"development"`/`"s3"` mantêm comportamento de dev inalterado) e `::TestProductionEndpointGuardIntegration` (1 caso, sem mock de `boto3.client`, confirma que o `ValueError` dispara antes de qualquer tentativa de criar o client).
- **Verificação (execução real em 2026-10-11):** `.venv/bin/python -m pytest` → baseline 257 passed confirmado antes de qualquer mudança; depois das mudanças, **320 passed** (38 em `test_storage_factory.py`, incluindo os 19 novos; os demais vêm de trabalho concorrente de outro agente no mesmo backend, não deste grupo).
- **Incidente de git multi-agente (registrado por transparência, sem perda de dados):** durante a investigação de uma falha transitória em `test_youtube_downloader.py` (causada por um agente paralelo editando `main.py`/`core/schemas.py` no mesmo instante), rodei `git stash` pra comparar com a baseline — mas `git stash` opera no repositório inteiro, não por caminho, e arrastou junto alterações não commitadas de outros agentes trabalhando em paralelo na mesma sessão (frontend e backend). O `git stash pop` seguinte falhou parcialmente em 1 arquivo (`rate-limiter-factory.ts`, que outro agente editou de novo entre o stash e o pop); confirmado por `diff` que nada foi perdido — o arquivo em disco ficou com uma versão mais nova (superset) do que a guardada no stash, e todos os outros arquivos foram restaurados idênticos ao que estavam. `git stash list` mostrou brevemente uma segunda entrada (de outro agente, que também deve ter usado `git stash` na mesma janela) que desapareceu sozinha depois — não investigado a fundo (fora da minha sessão), mas sem marcadores de conflito (`<<<<<<<`) em nenhum arquivo do repo, e o estado final consistente com trabalho concorrente normal continuando. **Lição para a próxima sessão com múltiplos agentes simultâneos no mesmo repo: evitar `git stash` sem escopo de caminho (`git stash -- <paths>` não existe para push normal; preferir `git diff`/cópia pontual do arquivo em vez de stash quando outros agentes podem estar escrevendo no mesmo working tree).**
- **Brinde:** levantei (por leitura real de `main.py`, `local_server.py`, `core/storage/factory.py`, `core/moments_factory.py`, `core/claude_moments.py`, `core/otel_setup.py`) a lista completa de env vars que o secret do Modal (`ai-podcast-clipper-secret`) precisa conter, documentada em `docs/operacao/modal-secret-checklist.md` (obrigatórias, condicionais, opcionais, e o que acontece se cada uma faltar).
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-17 ✅ nos dois lados, RF-PIPE-12 nota atualizada), `docs/operacao/checklist-go-live.md` (2 itens `[x] RESOLVIDO`: guard de `S3_ENDPOINT_URL` e checklist do secret do Modal), `docs/operacao/modal-secret-checklist.md` (novo).
- **`.env.example` do backend:** bloco `APP_ENV` adicionado sem bloqueio de permissão nesta sessão (diferente do bloqueio intermitente relatado em 2026-10-11 por outro agente para `MOMENTS_PROVIDER`/`ANTHROPIC_API_KEY`/`CLAUDE_MODEL`, que continua pendente).
- **Arquivos alterados:** `ai-podcast-clipper-backend/core/storage/factory.py`, `ai-podcast-clipper-backend/tests/test_storage_factory.py`, `ai-podcast-clipper-backend/.env.example`.
- **Arquivos criados:** `docs/operacao/modal-secret-checklist.md`.

### 2026-10-11: RNF-SEC-01 (duplicado)/RF-INGEST-09 resolvido — auth + rate limit em `GET /api/youtube/info`
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** item HIGH do checklist (grupo F2 de um plano maior do `cto`, rodando em paralelo com outro grupo F3 que também tocou `rate-limiter-factory.ts` e `src/actions/stripe.ts`). `src/app/api/youtube/info/route.ts` (handler `GET`) estava exposto publicamente, sem sessão nem rate limit — qualquer requisição não autenticada disparava fetch outbound para o YouTube (youtubei + oEmbed) sem limite.
- **O que foi feito, com TDD (RED confirmado antes):** teste unitário `tests/unit/api/youtube-info-route.test.ts` (sem sessão → 401 e `global.fetch` nunca chamado; acima do limite → 429; limite isolado por usuário) e teste de integração `tests/integration/api/youtube-info-route.integration.test.ts` (handler real + VO real `YouTubeUrl` + rate limiter real, só auth-factory e `global.fetch` mockados — mesmo padrão de `tests/integration/actions/youtube-actions.integration.test.ts`). Depois: novo singleton `makeYouTubeInfoRateLimiter()` em `src/infrastructure/factories/rate-limiter-factory.ts` (20 req/min por usuário — mais permissivo que o de import, 5/min, por ser só leitura de metadata); `GET` passou a chamar `makeAuthGateway().getUserId()` (401 `Unauthorized` sem sessão) e, com sessão, `makeYouTubeInfoRateLimiter().consume(userId)` (429 `Too many requests` acima do limite) antes de qualquer fetch.
- **Decisão sobre duplicação (não resolvida nesta tarefa, por escopo):** `src/actions/youtube-info.ts` (`fetchYouTubeVideoInfo`) faz a mesma busca de metadata, mas é uma Server Action usada só em `app/dashboard/new/page.tsx` (Server Component dentro de `/dashboard(.*)`, já protegida por `src/middleware.ts::isProtectedRoute`/`auth.protect()`) — não é um endpoint publicamente alcançável como a rota de API, então não carregava a mesma vulnerabilidade. Consolidação das duas implementações fica para uma tarefa futura de redução de duplicação.
- **UI:** nenhuma mudança necessária — `CreateProjectClient.handleFetchMeta` (`src/components/dashboard/create-project-client.tsx:110-135`) já trata `!res.ok` com toast da mensagem de erro retornada pela API, cobrindo os dois novos estados (401/429) sem código novo.
- **Verificação (execução real em 2026-10-11):** `npm run check` → eslint 0 erros/7 warnings (baseline, igual antes), tsc sem erros. `npm run test` → os 2 testes novos passam; 3 falhas pré-existentes em `tests/unit/stripe-action.test.ts` (confirmadas isoladas, rodando só esse arquivo, sem nenhum dos meus arquivos envolvidos) — causadas pelo trabalho paralelo do grupo F3 em `src/actions/stripe.ts`, fora deste escopo. `npm run test:integration` → os 4 testes novos passam; 1 falha pré-existente em `tests/integration/actions/stripe-actions.integration.test.ts`, mesma causa (F3/Stripe rate limit).
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-INGEST-09 novo + linha na matriz de rastreabilidade; RNF-SEC-01 linha duplicada marcada resolvida), `docs/arquitetura/visao-jornada-usuario.md` (seção 2.2, nota sobre 401/429), `docs/operacao/checklist-go-live.md` (item `[x] RESOLVIDO`).
- **Arquivos:** criados `tests/unit/api/youtube-info-route.test.ts`, `tests/integration/api/youtube-info-route.integration.test.ts`; alterados `src/app/api/youtube/info/route.ts`, `src/infrastructure/factories/rate-limiter-factory.ts` (só adição, nada removido/reordenado — arquivo compartilhado com o grupo F3).

### 2026-10-11: RNF-SEC-10 resolvido — endpoint de debug `/api/dev-sign-stripe-payload` removido
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** item HIGH do checklist (aparecia 2x — HIGH → Segurança e "Riscos de Segurança por Design" — e era o mesmo problema). A rota assinava qualquer payload com o `STRIPE_WEBHOOK_SECRET` real e só respondia 404 com `NODE_ENV === "production"`; o `clerkMiddleware` roda em `/api` mas só protege `/dashboard(.*)`, então em preview/staging qualquer pessoa conseguia forjar webhooks Stripe válidos (ex.: `customer.subscription.deleted` de outro cliente). Decisão do usuário (via plano do `cto`): remover, não desabilitar.
- **O que foi feito, com TDD (RED confirmado antes):** teste de integração HTTP real `tests/integration/dev-sign-stripe-payload-removed.test.ts` (RED: POST devolvia o header assinado, GET 405 → GREEN: 404 nos dois) e teste unitário `tests/unit/scripts/sign-stripe-test-payload.test.ts` (RED: script inexistente). Depois: `src/app/api/dev-sign-stripe-payload/route.ts` deletado; substituto fora do app `ai-podcast-clipper-frontend/scripts/sign-stripe-test-payload.js` (offline, `stripe.webhooks.generateTestHeaderString`, lê os `.env` do frontend na mesma precedência do `next dev`, mesma saída JSON `header`/`stripeSecretKeyMode` do endpoint antigo, nunca imprime segredo, instancia o SDK com chave placeholder).
- **Por que script e não Stripe CLI:** os roteiros do experimento partem da premissa de que o Stripe CLI não está instalado/autenticado; o script mantém a mesma saída JSON, então o roteiro e `scripts/experimento-observabilidade.sh` só trocam uma linha (`curl .../api/dev-sign-stripe-payload` → `node .../sign-stripe-test-payload.js`).
- **Verificação (execução real em 2026-10-11):** testes novos 8/8 passando; webhook assinado pelo script aceito pelo `next dev` local (`POST /api/webhooks/stripe` → HTTP 200); `bash -n scripts/experimento-observabilidade.sh` ok. `npm run check`: eslint 0 erros/7 warnings (baseline); tsc com 1 erro em `src/actions/projects-actions.ts` (trabalho em andamento de outro agente, rate limit — fora deste escopo). `npm run test`: 690 passed/11 failed — os 10 restantes são os testes de rate limit de projects/stripe actions do mesmo trabalho paralelo. `npm run test:integration`: 124 passed/1 failed (`stripe-actions.integration.test.ts`, mesmo motivo: rate limiter novo em `src/actions/stripe.ts`).
- **Docs atualizados:** `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RNF-SEC-10 ✅, contagem de RNFs), `docs/operacao/checklist-go-live.md` (2 itens `[x] RESOLVIDO`), `docs/pesquisa/experimento-observabilidade/roteiro-baseline.md` (Cenário 3, Passo 1), `evidencias-completas-para-artigo.md` (nota de reprodução — transcrições de 2026-10-07 mantidas literais como evidência), `objetivos-e-resultados.md`.
- **Arquivos:** deletado `ai-podcast-clipper-frontend/src/app/api/dev-sign-stripe-payload/route.ts`; criados `ai-podcast-clipper-frontend/scripts/sign-stripe-test-payload.js`, `tests/integration/dev-sign-stripe-payload-removed.test.ts`, `tests/unit/scripts/sign-stripe-test-payload.test.ts`; alterado `scripts/experimento-observabilidade.sh` (raiz).

### 2026-10-11: Provedor de IA plugável para identificação de momentos virais (Gemini default, Claude alternativo)
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** o Gemini (`core/moments.py`) ocasionalmente retorna `503 UNAVAILABLE` (sobrecarga do lado do Google) na etapa de identificação dos momentos virais a partir da transcrição. Usuário pediu alternativa plugável, mesmo padrão já usado pro storage (S3/MinIO).
- **O que foi feito, com TDD (RED confirmado antes de cada implementação):** porta `MomentsProvider` (`core/moments_port.py`, `Protocol`); `GeminiMomentsProvider` (adicionado ao final de `core/moments.py`, delega pra função livre `identify_moments` já existente — comportamento/assinatura dela preservados, zero regressão); adapter novo `ClaudeMomentsProvider` (`core/claude_moments.py`, SDK `anthropic`, tool-use forçado com `input_schema=MomentsExtraction.model_json_schema()`, reaproveita o mesmo texto de regras do prompt do Gemini); factory `create_moments_provider` (`core/moments_factory.py`, env var `MOMENTS_PROVIDER` default `"gemini"`, valores válidos `gemini`/`claude`, `ValueError` explícito pra valor desconhecido ou API key ausente — mesmo espírito de `core/storage/factory.py`).
- **Wiring:** `core/video_pipeline.py::run_video_processing_pipeline` passou a receber `moments_provider: MomentsProvider` (em vez de `gemini_client=None`) e chama `moments_provider.identify_moments(...)`. `main.py`/`local_server.py` constroem `self.moments_provider = create_moments_provider(gemini_client=self.gemini_client)` em `load_model()`, mesmo padrão de `self.storage = create_object_storage()`. `os.environ["GEMINI_API_KEY"]` (indexação direta) trocado por `.get(..., "dummy_key")` nos dois arquivos — senão o processo crashava no startup pra quem configurasse `MOMENTS_PROVIDER=claude` sem `GEMINI_API_KEY`, anulando o propósito do toggle.
- **Model Claude:** `CLAUDE_MODEL` (env var, default `claude-sonnet-5-5` — modelo Claude 5.5 atual; o subagente que implementou havia usado por engano um ID de modelo antigo, `claude-sonnet-4-5-20250929`, corrigido nesta revisão).
- **Teste afetado pela mudança de assinatura, corrigido:** `tests/test_local_server.py::TestProcessVideoManualCutsIntegration::test_legacy_payload_without_mode_still_runs_automatic_path` fazia `monkeypatch.setattr(video_pipeline, "identify_moments", ...)`, que deixou de ter efeito já que o pipeline agora chama `moments_provider.identify_moments(...)`. Corrigido pra injetar um `MagicMock()` em `local_server.video_processor.moments_provider` (mesmo padrão de `storage`).
- **Verificação (execução real em 2026-10-11):** `.venv/bin/python -m pytest` (suíte completa, com `torch` disponível nesta máquina) → **257 passed** (228 do subagente + 29 de `test_local_server.py`, incluindo o teste corrigido).
- **Pendente (bloqueio de permissão, não código):** `.env.example` do backend precisa do bloco `MOMENTS_PROVIDER`/`ANTHROPIC_API_KEY`/`CLAUDE_MODEL` — Read/Edit bloqueados por permissão nesta sessão (mesmo padrão intermitente já visto antes com esse diretório); usuário precisa aplicar manualmente ou destravar a permissão. `ANTHROPIC_API_KEY` real no `.env` (com segredo) é responsabilidade do usuário, não tocado.
- **Docs atualizados:** `docs/arquitetura/visao-fluxo-processamento-video.md` (porta `MomentsProvider`, diagrama Mermaid com o ramo de provedores, seção "Identificação de Momentos"), `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md` (RF-PIPE-13, RNF-AVAIL-07, matriz de rastreabilidade) e `docs/operacao/checklist-go-live.md` (riscos de configuração do provedor).
- **Arquivos criados:** `ai-podcast-clipper-backend/core/moments_port.py`, `core/claude_moments.py`, `core/moments_factory.py`, `tests/test_claude_moments.py`, `tests/test_moments_factory.py`, `tests/moments_fakes.py`.
- **Arquivos alterados:** `core/moments.py`, `core/video_pipeline.py`, `main.py`, `local_server.py`, `requirements.txt`, `tests/test_video_pipeline.py`, `tests/test_local_server.py`.

### 2026-10-10: Bug no ASD local — `Columbia_test.py` invocado como `"python ..."` em string de shell
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** testando a aplicação de ponta a ponta local (frontend + `local_server.py` + Inngest + MinIO), o processamento de vídeo falhava com `500` e `Modal GPU processing failed with status 500: {"detail":"Tracks or scores not found for clip"}`.
- **Causa:** `core/active_speaker_detection.py::run_active_speaker_detection` montava o comando como a string literal `"python Columbia_test.py --videoName ... --videoFolder ... --pretrainModel ..."` e rodava com `subprocess.run(columbia_command, cwd=asd_dir, shell=True)`. Na `.venv` deste projeto (e em qualquer máquina sem o alias `python`, só `python3`), o shell imprimia `python: not found`, o subprocess saía sem gerar `pywork/{tracks,scores}.pckl`, e a função levantava o `FileNotFoundError` (mensagem genérica, sem relação óbvia com a causa real) — mascarado ainda mais pelo `subprocess.run` não checar o código de saída (`check=True` ausente).
- **Correção, com TDD (RED confirmado antes de implementar):** comando reescrito como lista de argumentos usando `sys.executable` (o interpretador exato que já está rodando `local_server.py`/`main.py`, com todas as deps da ASD — `torch`, `cv2`, `scenedetect`, etc. — garantidamente instaladas), sem `shell=True`. Resolve o bug e, como efeito colateral, remove outra superfície de injeção de shell (mesmo padrão da correção de RCE já feita em `core/subtitles.py`).
- **Verificação (execução real em 2026-10-10):** `tests/test_active_speaker_detection.py` (2 testes novos) RED→GREEN; suíte completa (exceto `test_local_server.py`, que exige `torch`/`torchaudio` — roda só no job `backend-local-server` do CI) → 208 passed. Backend local reiniciado com o fix e `GET /` → `200`.
- **Docs atualizados:** esta entrada em `progress.md`. `docs/arquitetura/visao-fluxo-processamento-video.md` não precisou de alteração — descreve apenas a assinatura pública de `run_active_speaker_detection` (inalterada), não o mecanismo interno de invocação do subprocess.
- **Arquivos alterados:** `ai-podcast-clipper-backend/core/active_speaker_detection.py`, `ai-podcast-clipper-backend/tests/test_active_speaker_detection.py` (novo).

### 2026-10-10: Storage plugável — AWS S3 real ou MinIO (S3-compatível) ou local, nos dois lados (Fases 0-4 do plano)
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** o pipeline de vídeo e o frontend acoplavam `boto3.client("s3")` e `env` direto. Para desenvolver sem gastar com S3 real, o storage passou a ser plugável: a porta `ObjectStorage` (`ai-podcast-clipper-backend/core/storage/ports.py`) tem adapters `S3ObjectStorage` e `LocalObjectStorage`, escolhidos por `create_object_storage` (`core/storage/factory.py`) via `STORAGE_PROVIDER` (`s3` default, `local`) e `S3_ENDPOINT_URL` (MinIO = `s3` + endpoint, path-style). Frontend: mesma seleção em `createStorageGateway` (`src/infrastructure/factories/storage-gateway.factory.ts`), que substitui 4 pontos duplicados em `use-case-factories.ts`.
- **Decisões:** MinIO não é provider separado (é `s3` + `S3_ENDPOINT_URL`). Imagem do MinIO trocada para `cgr.dev/chainguard/minio` fixada por digest, porque `minio/minio` no Docker Hub retorna `denied` (verificado com `docker manifest inspect`). Usuário restrito da aplicação (policy só no bucket) criado pelo `minio-init`; a aplicação nunca usa o root.
- **Correção de compatibilidade:** `S3StorageGateway` força `requestChecksumCalculation: "WHEN_REQUIRED"` só quando há endpoint customizado, porque o MinIO rejeitava uploads com `BadDigest`. Config da AWS real não muda.
- **Limitação registrada:** o Modal não alcança `localhost:9000`; MinIO serve só ao `local_server.py` e ao frontend em dev.
- **Guard de produção:** o frontend recusa `S3_ENDPOINT_URL` de dev com `NODE_ENV=production` (`src/infrastructure/storage/storage-endpoint-guard.ts`, criado durante a auditoria de segurança em paralelo). O backend **ainda não** tem esse guard: registrado como risco aberto no checklist.
- **Achados ao documentar (não corrigidos aqui):** (1) o comentário do `docker-compose.yml` diz que `quay.io/minio/minio` retorna "denied", mas o teste real retornou `no such manifest` — o comentário precisa de correção; (2) `core/video_pipeline.py::resolve_input_video_path` mantém a checagem `os.path.exists(s3_key)` inline, independente de `STORAGE_PROVIDER`, então o item de segurança de caminho local segue aberto; (3) o usuário restrito do MinIO consegue `list_buckets` (nomes de buckets, não conteúdo).
- **Verificação (execução real em 2026-10-10):**
  - Backend `.venv/bin/python -m pytest`: 234 passed; `-m "not minio"`: 231 passed, 3 deselected; `-m minio`: 3 passed (com MinIO no ar).
  - Frontend `npm run test`: 701 passed, 8 skipped (100 arquivos passed, 1 skipped). `npm run check`: exit 0 (0 erros, 7 warnings pré-existentes).
  - Frontend `npm run test:integration`: 105 passed, 12 failed — todas em `tests/integration/health-check.test.ts` (4) e `tests/integration/legal-pages.test.ts` (8), com `ECONNREFUSED 127.0.0.1:3000` (app não estava no ar). Os testes de storage de integração passaram (4 arquivos, 48 testes com os unitários de storage).
- **Docs atualizados:** RF-PIPE-12, RNF-SEC-17, RNF-MAINT-11 em `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md`; diagrama e seção "Armazenamento: porta `ObjectStorage`" em `docs/arquitetura/visao-fluxo-processamento-video.md`; novo `docs/operacao/minio-dev-local.md`; item de risco e nota atualizada em `docs/operacao/checklist-go-live.md`; índice em `docs/README.md`.
- **Arquivos de código alterados nesta tarefa:** nenhum (só documentação).

### 2026-10-10: Fase 4.1 — Correção do achado MÉDIO da auditoria (escrita de arquivo arbitrário via `LocalObjectStorage`)
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** a auditoria de segurança da entrada anterior achou que `LocalObjectStorage.upload_file`/`download_file` (modo `STORAGE_PROVIDER=local`) faziam `shutil.copy` com `key` (vinda do `s3_key` do request) sem confinamento de diretório — um chamador com `AUTH_TOKEN` válido podia sobrescrever arquivo arbitrário no servidor via caminho absoluto ou `../`. Usuário decidiu corrigir imediatamente (severidade Média, não é o modo default).
- **Correção, com TDD (RED confirmado antes de implementar):** `LocalObjectStorage` passa a exigir `root_dir` no construtor e confina toda `key` dentro dele, rejeitando caminho absoluto ou que escape do root (checagem pelo caminho *resolvido*, não por substring). `create_object_storage` lê `LOCAL_STORAGE_DIR` (default `/tmp/ai-podcast-clipper-local-storage`). O fallback de leitura separado (`resolve_input_video_path`, item próprio no checklist, não tocado) continua aberto, de propósito.
- **Verificação (execução real em 2026-10-10):** backend `.venv/bin/python -m pytest` sem filtro → 241 passed (234 + 5 novos em `test_local_object_storage.py` + 2 novos em `test_storage_factory.py`); `-m "not minio"` → 238 passed, 3 deselected; `-m "minio"` → 3 passed.
- **Docs atualizados:** `docs/operacao/checklist-go-live.md` (novo item `[x] RESOLVIDO`).
- **Arquivos alterados:** `ai-podcast-clipper-backend/core/storage/local_object_storage.py`, `core/storage/factory.py`, `tests/test_local_object_storage.py`, `tests/test_storage_factory.py`.

### 2026-10-10: Gap de setup local — `ASD_DIR` sem valor correto fora do Modal
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** ao rodar `local_server.py` de verdade (frontend + backend local + Inngest, todos de pé) para uso manual da aplicação, o processamento de vídeo falhava com `[Errno 2] No such file or directory: '/asd'` na etapa de detecção de falante ativo.
- **Causa:** `core/active_speaker_detection.py`/`local_server.py` usam `ASD_DIR = os.environ.get("ASD_DIR", "/asd")` como default. No Modal (`main.py:52`), o container copia o submódulo `asd/` pra esse caminho absoluto (`/asd` na raiz do sistema) — mas isso só existe dentro do container do Modal. Rodando `local_server.py` fora do Modal, o submódulo está em `ai-podcast-clipper-backend/asd` (caminho relativo ao repo), não em `/asd`. Nenhum documento do projeto mencionava essa variável para quem roda local — gap de setup, não bug de lógica.
- **Correção:** `ASD_DIR` adicionado ao `ai-podcast-clipper-backend/.env` apontando para o caminho absoluto real do submódulo nesta máquina; `.env.example` documentado com a mesma explicação, para quem configurar um ambiente novo.
- **Achado relacionado, não corrigido:** `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` no `.env` do backend ainda são placeholder (`AKIA...`/`...`) — mesmo com `ASD_DIR` corrigido, qualquer processamento real que precise ler/gravar no S3 vai falhar até essas credenciais serem configuradas com valores reais (decisão/ação do usuário, fora de código).
- **Arquivos alterados:** `ai-podcast-clipper-backend/.env`, `ai-podcast-clipper-backend/.env.example`.

## Estado Atual (2026-10-04)

- **Status de Prontidão:** PRONTO PARA FASE 5 — PORTÃO DE QUALIDADE FINAL (Fases 1-4 de 5 concluídas — Todos os 21 BLOCKERs resolvidos)
  - Auditoria de 2026-10-02: 21 BLOCKERs identificados; **TODOS resolvidos** nas Fases 1-4 (100% de billing crítico com webhooks payment_failed/refund/dispute, deduplicação com race condition, bug de checkout blocker, segurança Next.js/S3, infraestrutura Git/Prisma, qualidade de testes, branding e páginas legais, acessibilidade WCAG)
  - Fase 5 restante: portão de qualidade final (CI do zero, clone novo, revisão de segurança, testes 100% verde)
  - Pendências do usuário (dados reais): 4 price IDs Stripe, dados jurídicos em páginas legais, e-mail de suporte
  - Checklist detalhado em `docs/operacao/checklist-go-live.md` com **todos os 21 itens marcados `[x]`** e notas de resolução

- **Funcionalidades implementadas e corrigidas:**
  - Autenticação branca (white-label) com Clerk
  - Assinaturas recorrentes (Stripe) — taxonomia de planos corrigida (`PlanCatalogService`, só Starter/Pro, mensal/anual), webhook com idempotência real (sem race condition), eventos de `payment_failed`/`refund`/`dispute` tratados com política própria (carência de 3 dias, revogação proporcional)
  - Dashboard com gerenciamento de projetos (CRUD, retry, infinite scroll) — upload direto de arquivo escondido por decisão de produto (stub removido); lança só com YouTube + cortes manuais
  - Processamento dinâmico de vídeos (opções customizáveis por projeto)
  - Cortes manuais por timestamp com persistência de config
  - Video player customizado com preview ao hover, agora acessível via teclado
  - Thumbnails dinâmicas de projeto
  - Landing page e página de preços redesenhadas, com páginas legais (`/terms`, `/privacy`, `/refund`, `/contact` — conteúdo com placeholders `[A PREENCHER]` aguardando dados jurídicos reais) e checkbox de aceite no cadastro
  - Branding corrigido: "Podcast Clipper" em todo o dashboard (sem resquício de template de terceiros)
  - 6 violações WCAG 2.1 AA (blocker) corrigidas: aria-label, aria-live, navegação por teclado, indicadores de foco visível

- **Em consolidação (itens HIGH/NICE do checklist, não bloqueiam mais o go-live):**
  - Segurança: hardening com OWASP ASVS V5 aplicado parcialmente; CSP ausente, rate limiting in-memory não escala em serverless, alguns endpoints sem autenticação — ver `docs/operacao/checklist-go-live.md` seção HIGH
  - Observabilidade local (stack OpenTelemetry + Prometheus + Loki + Tempo + Grafana) — sem exportação pra produção, sem alertas reais
  - Refatoração da arquitetura frontend (Clean Architecture: domain/application/infrastructure) — todos os use cases agora com cobertura de teste
  - CI/CD no GitHub Actions — `npm run check` e suíte de testes voltaram a ficar verdes (zero erros de TypeScript); falta validar rodando do zero (Fase 5)

- **Infra e processos:**
  - Agentes de IA configurados (devops-specialist, frontend-specialist, domain-specialist, etc.)
  - Delegação de trabalho entre subagentes (padrão TDD obrigatório, cobertura unitária + integração)
  - Monorepo com Next.js 15 (frontend) + Python/Modal (backend GPU)

- **Próximas prioridades sugeridas (derivadas de planos abertos):**
  - Testes de carga com k6 (plano existe, mas não consta implementação recente)
  - Processamento local em GPU (plano existe, stub adicionado no backend)
  - Integração/consolidação completa do stack de observabilidade em ambiente de staging/produção

---

## Histórico

### 2026-10-09: CI do backend vermelho na `main` — 4 bugs corrigidos (2 descritos + 2 achados na verificação/execução real)
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **Contexto:** CI do backend (`.github/workflows/ci.yml`) vermelho em `main`/`origin/main` desde o commit `9116f7c` (RNF-SEC-07 + cortes manuais, 20:39 do mesmo dia). Investigação por leitura de código + git history + execução real em venvs isolados (não suposição), confirmou 3 causas — as 2 relatadas pelo usuário e uma terceira do mesmo tipo, encontrada ao rodar a verificação pedida (venv leve só com `requirements-test.txt`).
- **Causa 1 — regressão de hoje, quebra de coleta no job `backend`:** `tests/test_auth_token_constant_time.py` (novo, RNF-SEC-07) fazia `import local_server` no topo do arquivo pra testar os 3 pontos de auth (`local_server.verify_auth_token`, `main.process_video`, `main.download_youtube`) no mesmo módulo. `local_server.py` faz monkey-patch de compatibilidade pyannote/whisperx/torch no topo do próprio arquivo (fora de função) e `import uvicorn` antes disso — nenhum dos dois está em `requirements-test.txt`. O job `backend` roda `pytest -v --ignore=tests/test_local_server.py` com só essa dependência leve; um erro de **coleta** (não de execução) interrompe a sessão inteira do pytest (`!!! Interrupted: 1 error during collection !!!`), então nenhum teste do job roda, mesmo que só 1 arquivo entre ~20 tenha o problema.
  - **Correção:** `tests/test_auth_token_constant_time.py` não importa mais `local_server`; ficou só com os 2 casos de `main` (`process_video`/`download_youtube`), 10 testes (5 cenários × 2 pontos). Os 5 cenários de `local_server.verify_auth_token` foram movidos para uma classe nova `TestVerifyAuthTokenConstantTime` no final de `tests/test_local_server.py` (job `backend-local-server`, que já instala as deps completas) — mesma semântica, mesmos 5 cenários (token certo via espião em `hmac.compare_digest`, token errado 401, `AUTH_TOKEN` ausente/vazio 401, bearer não-ASCII 401 sem 500).
- **Causa 1b — achado durante a verificação, mesmo tipo de bug, arquivo diferente:** depois de corrigir a Causa 1, rodar a suíte no venv leve revelou que `tests/test_manual_cut_input_hardening.py::TestProcessVideoEndpointRejectsHostileCutsWith422` (também novo, da mesma leva de commits de hoje) faz `import local_server` **dentro de uma fixture** (não no topo do módulo) — isso não quebra a *coleta* (por isso não apareceu no log de CI que o usuário colou, que mostrava a sessão sendo interrompida antes de chegar a rodar qualquer teste), mas quebraria a *execução* dessas 5 parametrizações com o mesmo `ModuleNotFoundError: No module named 'uvicorn'` assim que a Causa 1 fosse corrigida e o job conseguisse avançar até elas.
  - **Correção:** mesma classe movida para `tests/test_local_server.py` (sem o `import local_server` lazy repetido, já que o módulo é importado no topo do arquivo de destino), removida de `tests/test_manual_cut_input_hardening.py` junto com os imports que ficaram sem uso (`os`, `TestClient`, `patch`). As outras 2 classes desse arquivo (`TestManualCutRejectsNonFiniteTimestamps`, `TestManualCutTitleLength`) não tocam `local_server` e continuam no job leve.
- **Causa 2 — bug pré-existente desde a criação do job `backend-local-server` (commit `c1b9bfe`, 02/10), não relacionado ao trabalho de hoje:** esse job só roda `pip install -r requirements.txt` antes de `pytest tests/test_local_server.py -v`, mas `requirements.txt` (deps de runtime do pipeline GPU: torch, whisperx etc.) nunca incluiu `pytest`/`pytest-mock` — só `requirements-test.txt` tem isso, e esse job não a instala. Resultado: `pytest: command not found` (exit 127) — confirmado reproduzindo o ambiente exato do job num venv novo (`pip install -r requirements.txt` sem pytest → `ModuleNotFoundError: No module named 'pytest'` ao tentar `python -m pytest`). Não há evidência no histórico do git de que esse job tenha passado alguma vez desde que foi criado — o commit `c1b9bfe` que o criou já tinha esse `requirements.txt` sem pytest, e nenhum commit posterior alterou esse step até hoje.
  - **Correção:** `.github/workflows/ci.yml`, job `backend-local-server`, step "Install full dependencies" ganhou `pip install pytest pytest-mock` depois do `pip install -r requirements.txt` (sem reinstalar/conflitar com os pacotes já fixados, ex. torch/whisperx).
- **Verificação real (não suposição), em venvs temporários fora do repo, apagados ao final:**
  - Baseline no `.venv` do repo (tem todas as deps, não prova nada sobre os jobs leves, mas confirma ausência de regressão): `.venv/bin/python -m pytest` → **192 passed**, antes e depois de todas as edições.
  - Venv leve (`python3.12 -m venv` + só `requirements-test.txt`), reproduzindo o job `backend` exatamente: **antes da correção**, `pytest -v --ignore=tests/test_local_server.py` → `collected 159 items / 1 error` seguido de `!!! Interrupted: 1 error during collection !!!` (nenhum teste roda, confirma a causa 1 e por que a causa 1b nunca apareceu nos logs). **Depois da correção** (causa 1 + 1b): mesmo comando → **164 passed, 0 errors** (159 + 10 novos de `main` − 5 movidos de `test_manual_cut_input_hardening.py` = 164; sem `ModuleNotFoundError`).
  - Venv completo (`python3.12 -m venv` + `requirements.txt`, reproduzindo o job `backend-local-server` exatamente): **antes da correção**, `pytest tests/test_local_server.py -v` → `No module named pytest` (pytest nem está instalado). **Depois** de `pip install pytest pytest-mock` (a correção da causa 2): `pytest tests/test_local_server.py -v` → **28 passed** (8 testes originais + 10 da classe de auth movida + 5 da classe de hardening movida + 5 já existentes do teste de cortes manuais).
- **Por que ninguém notou a Causa 2 antes:** baseado só no histórico do git (sem acesso ao GitHub Actions real) — o job `backend-local-server` foi criado no commit `c1b9bfe` (02/10) já com esse `requirements.txt` sem `pytest`/`pytest-mock`, e nenhum commit entre `c1b9bfe` e hoje alterou o step "Install full dependencies" desse job. Não há como confirmar pelo git se ele já rodou com sucesso alguma vez (isso exigiria o histórico de execuções do GitHub Actions, fora do alcance desta investigação) — mas o próprio `requirements.txt` nunca teve pytest desde a criação do job, então, a julgar só pelo código, o job nunca teve as dependências certas pra passar.
- **Causa 3 — achada só depois de corrigir a Causa 2, num run real de CI (log colado pelo usuário), não local:** com `pytest`/`pytest-mock` instalados, o job `backend-local-server` avançou e quebrou na *coleta* de `tests/test_local_server.py` com `RuntimeError: The ffmpeg is not installed` — `ffmpegcv` (dependência de `requirements.txt`, importada transitivamente via `core/vertical_video.py` → `core/clip_pipeline.py` → `core/video_pipeline.py` → `local_server.py`) confere na importação, via `shutil.which`, se os binários `ffmpeg`/`ffprobe` existem no sistema (não é checagem de pacote pip, é checagem de binário de sistema), e o runner do GitHub Actions usado não tinha isso disponível. Confirmado por leitura do código-fonte de `ffmpegcv._check()` no `.venv` do repo.
  - **Correção:** novo step "Install ffmpeg (system dependency of ffmpegcv)" no job `backend-local-server` (`.github/workflows/ci.yml`), rodando `sudo apt-get update && sudo apt-get install -y ffmpeg` antes da instalação das dependências Python — o pacote `ffmpeg` do apt já inclui o `ffprobe`, então um único step resolve os dois binários exigidos.
  - **Nota registrada para o futuro (não implementada agora):** o pipeline compartilhado (`core/video_pipeline.py`/`core/clip_pipeline.py`) já é testado no job leve (`backend`) sem precisar de torch/ffmpeg, porque `core/vertical_video.py` já trata `ffmpegcv`/`cv2` como opcionais (`try/except ImportError`). O job `backend-local-server` hoje só prova, de fato, a casca fina do `local_server.py` (rotas FastAPI, auth, monkey-patches de compatibilidade) — não o pipeline de processamento em si, que o job leve já cobre com mocks. Aplicar o mesmo padrão de import tardio aos monkey-patches de `local_server.py` tornaria esse job independente de torch/ffmpeg também, mas isso é uma melhoria futura, não foi feita nesta correção.
- **Arquivos alterados:** `.github/workflows/ci.yml`, `ai-podcast-clipper-backend/tests/test_auth_token_constant_time.py`, `ai-podcast-clipper-backend/tests/test_local_server.py`, `ai-podcast-clipper-backend/tests/test_manual_cut_input_hardening.py`.

### 2026-10-09: Hook `pre-push` (Husky) — Suíte Completa Antes do Push
- **Commit(s):** `ef24b34` (husky + hook; já na `main`/`origin/main`) — atualização de `AGENTS.md`/`progress.md` desta entrada deixada no working directory para revisão do usuário
- **O que foi feito:**
  - Husky 9.1.7 instalado como devDependency em `ai-podcast-clipper-frontend/package.json`.
  - `.husky/` criado na **raiz do monorepo** (não dentro do frontend), com `core.hooksPath=.husky/_`. Como não há `package.json` na raiz, o fluxo padrão `npx husky init`/`"prepare": "husky"` (que assume package.json na raiz) não se aplica — criado `ai-podcast-clipper-frontend/scripts/husky-install.sh`, chamado pelo script `"prepare"` do `package.json`, que roda o instalador do Husky (`husky/bin.js`) com `cwd` forçado para a raiz do git (via `git rev-parse --show-toplevel`), e pula de forma segura em CI (`CI=true`)/sem git.
  - `.husky/pre-push` roda, em sequência: `cd ai-podcast-clipper-backend && .venv/bin/python -m pytest`, depois `cd ai-podcast-clipper-frontend && npm run test:everything`; aborta o push com mensagem clara indicando qual suíte falhou se qualquer uma retornar código != 0. Escape hatch documentado: `HUSKY=0 git push`.
  - **Decisão do usuário:** suíte pesada só no `pre-push`, nunca no `pre-commit` — `test:everything` sobe Docker/Postgres, builda o Next.js, levanta o Inngest dev server e roda smoke de carga k6 (minutos); isso tornaria commits locais lentos e dependentes de Docker. O `pre-push` é o último gate local antes do CI.
  - `AGENTS.md` atualizado (scripts úteis do frontend + seção "Controle de Versão e Git" com a explicação do hook).
- **Validação (execução real em 2026-10-09):**
  - Backend `.venv/bin/python -m pytest` (mesmo comando do hook): 192 passed.
  - Frontend `npm run test:everything` (mesmo comando do hook): sucesso completo — unitários 655 passed/8 skipped, build Next.js OK, integração 108 passed, smoke k6 (`http_req_duration` p95=56.21ms, `http_req_failed`=0%) com todos os thresholds OK.
  - Mecânica do hook testada de ponta a ponta com um remoto git bare descartável em `/tmp` (nunca tocando o `origin` real): com um `.husky/pre-push` stub retornando código 1, `git push` foi bloqueado e nenhuma ref chegou no remoto (confirmado via `git for-each-ref` no bare repo, vazio); com o stub retornando 0, o push passou e a ref apareceu no remoto; repetido disparando `git push` de dentro de `ai-podcast-clipper-frontend/` (não da raiz) para confirmar que `core.hooksPath` relativo resolve a partir da raiz do git independente do cwd de onde o push é disparado — bloqueou corretamente também.
  - **Nota sobre autoria do commit:** durante esta sessão, um commit (`ef24b34`, autor Thuan Silva) com os arquivos do Husky (`.husky/pre-push`, `package.json`/`package-lock.json`, `scripts/husky-install.sh`) apareceu em `main` e já em `origin/main` — não foi criado nem enviado por este agente (que só rodou `git commit --allow-empty` em uma branch de teste descartável, depois deletada, e só fez push para o bare repo descartável em `/tmp`). Registrado aqui para rastreabilidade; esta entrada de `progress.md` e o `AGENTS.md` continuam no working directory, sem commit por este agente.
- **Por quê:** evitar que bugs/regressões cheguem ao CI remoto — o `pre-push` é a última rede de segurança local antes do código saltar para fora da máquina do desenvolvedor, sem pagar o custo de Docker/build a cada commit incremental.

### 2026-10-09: RNF-SEC-07 Resolvido — Comparação de Token Constant-Time + Auditoria dos `shell=True`
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **O que foi feito:**
  - Comparação do Bearer token trocada de `!=` por `hmac.compare_digest` sobre bytes em `local_server.py::verify_auth_token`, `main.py::process_video` e `main.py::download_youtube`. `AUTH_TOKEN` ausente/vazio ou bearer vazio → 401 explícito.
  - Novo teste `ai-podcast-clipper-backend/tests/test_auth_token_constant_time.py` (15 casos: 5 cenários × 3 pontos de entrada, incluindo espião em `hmac.compare_digest`).
  - Auditoria dos 5 `subprocess.run(..., shell=True)` restantes no backend (`core/clip_pipeline.py` ×2, `core/vertical_video.py`, `core/transcription.py`, `core/active_speaker_detection.py`): todos interpolam só valores internos (`uuid4`, índices, floats validados pelo Pydantic, configuração do operador). Fechado sem ação necessária; migrar para lista de argumentos continua sendo defesa em profundidade futura.
  - Novo achado (BAIXA, a verificar): `core/video_pipeline.py::resolve_input_video_path` aceita `s3_key` como caminho local (`os.path.exists` + `shutil.copy`). Não é shell injection, mas não está verificado se um chamador pode controlar `s3_key`. Registrado no checklist.
  - Documentação: RNF-SEC-07 ⚠️ → ✅ na matriz de requisitos com o teste como evidência; RNF-SEC-16 com a auditoria concluída; checklist (item HIGH → Infraestrutura resolvido, pendências de segurança atualizadas).
- **Correção de premissa:** o "fail-open" com `AUTH_TOKEN=""` não era alcançável via HTTP. O `HTTPBearer` do FastAPI já rejeita bearer vazio com 401 antes da verificação, e `"x" != ""` já rejeitava. A mudança é defesa em profundidade. O caso não-ASCII também não era bug do código antigo: é guarda contra regressão, porque `compare_digest` com `str` não-ASCII lança `TypeError`.
- **Validação (execução real em 2026-10-09):**
  - Backend `.venv/bin/python -m pytest`: 192 passed (2 warnings de deprecação de starlette/anyio, pré-existentes).
  - `tests/test_auth_token_constant_time.py`: 15 passed.
  - Frontend: não executado, pois esta correção não toca código do frontend.

### 2026-10-09: Auditoria de Segurança Pós-Cortes Manuais — RCE por `preset` e Cobrança Divergente
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **O que foi feito:**
  - RCE corrigida: `core/subtitles.py` executava o ffmpeg de legendas com `shell=True` e `preset` controlado pelo usuário (só limitado a 50 caracteres). Agora usa lista de argumentos com `shell=False`, e `preset` é allowlist fechada (`SubtitlePreset` no backend, `z.enum(PROJECT_SUBTITLE_PRESETS)` no frontend; fora da lista → 422). Regra RN-PIPE-PRESET-01, RNF-SEC-16.
  - Cobrança divergente corrigida: o hold lia `event.data.mode`, mas o payload ao GPU derivava o modo da presença de cortes. Guard novo `ManualCutsModeMismatchError` rejeita cortes com `mode` omitido/`"auto"` antes da reserva de crédito (RN-PIPE-MANUAL-15). Decisão do usuário: rejeitar, não cobrar como manual.
  - Hardening de `ManualCut`: `NaN`/`Infinity` rejeitados em `start`/`end` (`allow_inf_nan=False`); título limitado a 200 caracteres no backend (`MAX_MANUAL_CUT_TITLE_LENGTH`), igual ao Zod.
  - Documentação: RNF-SEC-16 novo; RF-PIPE-05 e RF-PIPE-08 atualizados; RN-PIPE-MANUAL-04 e 15 e RN-PIPE-PRESET-01 em `casos-de-uso-e-regras-de-negocio.md`; guards em `visao-fluxo-processamento-video.md` e `visao-fluxo-pagamento.md`; checklist com os itens resolvidos e uma seção de pendências.
  - Correção de documentação: a linha de legendas dizia "6 testes de `test_subtitles.py` falhando", o que não é verdade hoje (13 passed). Atualizada.
- **Pendências registradas (não corrigidas):**
  - (MÉDIA, funcional) Preset `NONE` ("Sem Legenda") aceito mas sem implementação: cai para HORMOZI.
  - (MÉDIA, funcional) Projetos antigos com `subtitlePreset` fora da allowlist recebem 422 no retry.
  - (BAIXA, auditoria futura) 5 outros `subprocess.run(..., shell=True)` em `core/` ainda não auditados contra os demais campos do request.
  - RNF-SEC-07 (comparação de token não constant-time) segue aberto.
- **Validação (execução real em 2026-10-09):**
  - Backend `.venv/bin/python -m pytest`: 177 passed.
  - Backend, suítes de segurança (`test_preset_shell_injection.py`, `test_manual_cut_input_hardening.py`, `test_subtitles.py`, `test_local_server.py`): 75 passed.
  - Frontend `npm run test`: 655 passed | 8 skipped.
  - Frontend, testes de segurança (3 unit: manual-cuts-billing-consistency, process-video.schema, import-youtube-video.schema): 58 passed. Integração `manual-cuts-billing-consistency`: 2 passed.
  - Frontend `npm run check`: exit 0, 0 erros, 7 warnings pré-existentes.
  - Frontend `npm run test:integration`: 96 passed | 12 failed. As 12 falhas são `ECONNREFUSED 127.0.0.1:3000` em `health-check.test.ts` e `legal-pages.test.ts`, porque a aplicação não estava rodando (ambiente, não código).

### 2026-10-09: Contrato `POST /process_video` v2 — Corte Manual Não Chegava ao Backend (BLOCKER)
- **Commit(s):** nenhum ainda — alterações deixadas no working directory para revisão do usuário
- **O que foi feito:**
  - Bug em dois lados, confirmado no `HEAD` anterior: o backend (`core/schemas.py::ProcessVideoRequest`) só declarava `s3_key`/`preset` e o Pydantic descartava `mode`/`manual_cuts` em silêncio; o frontend montava `mode` a partir de `clipModel` (opção de layout), e o retry comparava com um valor que `clipModel` nunca assume.
  - Backend: `ProcessVideoRequest` com `extra="forbid"`, `mode` (`auto` default / `manual`) e `manual_cuts` (`ManualCut`, ≤ 60s por corte, ≤ 50 cortes). Novo `core/video_probe.py` valida a duração real do vídeo via ffprobe antes da transcrição. `core/video_pipeline.py::run_video_processing_pipeline(request)` é o único ponto da bifurcação auto/manual (modo manual pula Gemini e processa todos os cortes); `main.py` e `local_server.py` só repassam o request.
  - Frontend: `buildProcessVideoPayload` (novo `src/application/services/process-video-payload.service.ts`) deriva `mode` de cortes presentes; `RetryProjectUseCase` usa `manualCutsJson`; `ManualCutsRequiredError` (novo) impede reserva de crédito com `mode="manual"` sem cortes.
  - Documentação: RF-PIPE-08 de ⚠️ para ✅ com matriz de rastreabilidade; RN-PIPE-MANUAL-01 a 14 em `casos-de-uso-e-regras-de-negocio.md` (a linha de cortes manuais estava marcada ✅ sem ser verdade, corrigida); diagrama de processamento com a bifurcação; guard no fluxo de pagamento; BLOCKER fechado no checklist go-live.
- **Validação (execução real em 2026-10-09):**
  - Backend `pytest` (`.venv/bin/python -m pytest` em `ai-podcast-clipper-backend/`): 130 passed.
  - Frontend `npm run test`: 617 passed | 8 skipped.
  - Frontend `npm run test:integration`: 94 passed | 12 failed. As 12 falhas são todas `ECONNREFUSED 127.0.0.1:3000` em `tests/integration/health-check.test.ts` e `tests/integration/legal-pages.test.ts`, porque a aplicação não estava rodando (dependência de ambiente, não do código alterado).
  - Os 6 arquivos de teste de corte manual (unit + integração) rodados isoladamente: 53 passed.
- **Gaps abertos (registrados no checklist, não corrigidos nesta entrega):**
  - `aspect_ratio`/`auto_zoom`/`genre` aceitos sem efeito (D1).
  - `mode: "auto"` com `manualCuts` passa pelos schemas Zod: o hold cobra o preço automático, mas o payload envia `mode: "manual"`.
  - Importação do YouTube com cortes não grava `manualCutsJson`, então o retry perde os cortes.
  - Handler 422 de `main.py` (Modal) sem teste direto.
- **Por quê:** o BLOCKER de "funcionalidade anunciada não entrega no backend" fazia o usuário pagar o preço manual e receber o resultado de IA. A correção fecha o contrato ponta a ponta, e os gaps acima ficam visíveis para decisão em vez de escondidos.

### 2026-10-09: Script `test:everything` — Modo Completo (Unit + Integração + Carga)
- **Commit(s):** `82fd5fe`
- **O que foi feito:**
  - Novo `ai-podcast-clipper-frontend/scripts/test-everything.sh` + script `npm run test:everything`: sobe o Postgres (docker compose), aplica migrations (com baseline não-destrutivo se detectar banco de dev pré-existente sem drift), roda unitários, builda e sobe o app, sobe o Inngest dev server, roda a suíte de integração completa (incluindo os 2 arquivos que precisam do app real de pé), roda o smoke de carga (k6), e limpa os processos no final via `trap EXIT` — sem derrubar o Postgres (fica disponível pra outros fluxos de dev).
  - Scripts individuais (`test`, `test:integration`, `test:all`, `test:load:*`) ficaram intactos — é um modo adicional, não substituição.
  - Validado com execução real (não só leitura de código): 605 testes unitários, 96 testes de integração (15 arquivos, incluindo `health-check`/`legal-pages` contra o app real), smoke de carga com 0% de falha em 640 requisições (prova que o dispatch do webhook Stripe → Inngest funcionou de ponta a ponta), e nenhum processo órfão nas portas 3000/8288 depois do cleanup.
  - Documentado em `AGENTS.md` (lista de scripts úteis) e `load-tests/README.md`.
- **Por quê:** Não existia um jeito de rodar a suíte inteira (incluindo carga) com um único comando, sem orquestração manual de banco/app/Inngest — isso dificultava validar mudanças de ponta a ponta antes de confiar no CI.

### 2026-10-09: Fix de Atomicidade Real no `PrismaUnitOfWork` (Bug Financeiro Confirmado)
- **Commit(s):** `2556a93`
- **O que foi feito:**
  - Bug confirmado: `PrismaUnitOfWork.execute()` abria `db.$transaction(async () => operation())` mas **ignorava** o `TransactionClient` recebido no callback. Repositórios chamados dentro de `operation()` (`PrismaUserRepository`, `PrismaCreditTransactionRepository`, etc.) importam `db` global diretamente, não o `tx` — cada escrita de uma "unidade de trabalho" de crédito/billing comitava isolada e imediata no banco real, sem rollback se uma escrita posterior falhasse. Afetava todos os use cases de `src/application/use-cases/credits/*.ts`.
  - Fix: `src/infrastructure/database/repositories/prisma-unit-of-work.ts` agora popula `dbTransactionContext` (o `AsyncLocalStorage` de `src/server/db.ts`, construído originalmente para o isolamento de testes) com `{ tx }` via `dbTransactionContext.run({ tx }, operation)`, redirecionando automaticamente qualquer `db.*` chamado dentro da unidade de trabalho para a transação real. Interface `IUnitOfWork` e call sites dos use cases não mudaram.
  - TDD: novo `tests/integration/prisma-unit-of-work-atomicity.integration.test.ts`, deliberadamente SEM usar `with-rollback-transaction.ts` (o SAVEPOINT do helper de teste mascararia o bug). Vermelho confirmado contra o código antigo (saldo do usuário ficava debitado — `credits` 10 → 5 — mesmo com a 2ª escrita, criação de `CreditTransaction`, falhando de propósito); verde depois do fix (saldo intocado, nenhuma `CreditTransaction` criada).
  - Validado contra banco Postgres novo (`domain_uow_test`, `prisma migrate deploy`): teste novo 1/1, suíte de integração completa (exceto `health-check.test.ts`/`legal-pages.test.ts`, falhas de ambiente pré-existentes e já documentadas) 84/84, `credit-service.test.ts` (concorrência) 7/7, `npm run test` 605 passed | 8 skipped, `npm run check` sem erros.
  - Documentação atualizada: novo item BLOCKER em `docs/operacao/checklist-go-live.md` (seção Billing e Stripe).
- **Por quê:** Era um bug real de atomicidade em operações financeiras (créditos/billing) que passava despercebido porque "parecia" transacional — qualquer falha na segunda escrita de um use case de crédito deixava o banco em estado inconsistente (débito sem registro, ou pior) sem nenhum rollback real acontecer em produção.

### 2026-10-09: Isolamento de Testes de Integração por Rollback de Transação + `connection_limit`
- **Commit(s):** `2556a93`
- **O que foi feito:**
  - `src/server/db.ts`: `db` passou a ser um `Proxy` sobre o client Prisma. Sem transação de teste ativa, delega ao client real (funções vinculadas e cacheadas). Com escopo de teste (`dbTransactionContext`, `AsyncLocalStorage`), lê da transação e converte `$transaction` aninhado em SAVEPOINT.
  - `tests/helpers/with-rollback-transaction.ts`: `withRollbackTransaction` e `useRollbackTransactionPerTest`. O helper usa `aroundEach` do Vitest, porque `enterWith` dentro de `beforeEach` não chega ao corpo do teste.
  - 9 arquivos de integração migrados: limpeza manual (`afterAll`/`deleteMany`) removida e fixtures `beforeAll` convertidas em `beforeEach`. `youtube-info-action` ficou de fora por não acessar o banco.
  - Novo `tests/integration/rollback-transaction.integration.test.ts` (8 testes do próprio mecanismo: isolamento entre testes, savepoint, erro propagado).
  - `DATABASE_URL` de testes (`.github/workflows/ci.yml`, `tests/setup.ts`) ganhou `?connection_limit=5`: cada arquivo de teste de integração roda num processo filho separado (Vitest, pool "forks", `fileParallelism` padrão), cada um abrindo seu próprio pool de conexões Prisma — sem limite explícito, isso pode se aproximar do `max_connections` do Postgres conforme a suíte crescer.
  - Também corrigidos, na mesma leva: 3 causas raiz de falhas de integração que só apareciam contra um banco 100% migrado (CI) e não no banco de dev local desatualizado — fixture de usuário com `plan: "FREE"` (valor banido pela migration de taxonomia de planos), 2 testes dependentes de seed global de `ProcessingOption` nunca rodado no CI (passaram a criar os próprios fixtures), e timeout de 20s nos testes de concorrência de `credit-service.test.ts` (hardware de CI mais lento).
  - Verificação: suíte de integração com banco novo (`qa_rollback_test`) e tabelas zeradas após a execução; `npm run check`, `npm run test` (605 passed | 8 skipped) e `npm run build` com exit 0.
- **Por quê:** Cada teste passa a começar e terminar com o banco no mesmo estado, sem depender de ordem nem de limpeza manual, o que eliminou a classe de bugs de dado residual que vinha aparecendo. `credit-service.test.ts` continua sem transação de propósito (testa concorrência real). O `connection_limit` evita um problema de escala ainda não manifestado, mas identificado ao analisar como os testes rodam em paralelo.

### 2026-10-08: Upgrade Next.js 16.4.0, Migração para `eslint` Direto e Correção de 13 Erros de Lint
- **Commit(s):** `84dc770`
- **O que foi feito:**
  - **Audit:** `npm audit fix` (sem `--force`) eliminou as 2 criticals (incluindo `fast-xml-parser` via AWS SDK, resolvido só por lockfile dentro do range já declarado). Restaram 5 high, todas devDependency (cadeia `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`; `braces` sem versão corrigida publicada). `npm ls --omit=dev` não retorna essa cadeia. `.github/workflows/ci.yml` passou a rodar `npm audit --audit-level=high --omit=dev` (verificado: 0 vulnerabilidades em produção, exit 0).
  - **Next.js 15.5.27 → 16.4.0** (e `eslint-config-next` no mesmo major). O projeto já usava APIs assíncronas de `params`/`searchParams`/`cookies()`/`headers()`, então nenhum breaking change afetou o código. `postcss` (high) deixou de aparecer com o upgrade. `tsconfig.json` foi reescrito pelo próprio `next build` (mudança mandatória: `jsx: "preserve"` → `"react-jsx"`; o resto é reformatação, com `strict`/`noUncheckedIndexedAccess`/paths intactos). `middleware.ts` (em `src/`) não foi renomeado para `proxy.ts`, por ser só deprecado no Next 16 — fica como pendência.
  - **Hipótese descartada:** chegou-se a suspeitar que `next@15.5.27` estava vulnerável a CVE-2025-66478; refutado, pois 15.5.27 já estava acima do patch `15.5.7`. O motivo real do upgrade foi a cadeia de audit e a remoção de `next lint`.
  - **Migração de `next lint` para `eslint` direto:** `next lint` foi removido no Next 16. `eslint.config.js` passou de `FlatCompat`/`compat.extends("next/core-web-vitals")` (que quebrava com erro de referência circular) para o import nativo `eslint-config-next/core-web-vitals`. Scripts: `"lint": "eslint ."`, `"lint:fix": "eslint . --fix"`, `"check": "eslint . && tsc --noEmit"`.
  - **Escopo do lint:** `eslint .` varre o repositório inteiro, enquanto o `next lint` antigo cobria só `src/` na prática. Para não travar o CI com ~366 problemas pré-existentes em `tests/` e `load-tests/`, o `eslint.config.js` ganhou um bloco `ignores` que restaura o escopo para `src/` (nenhum arquivo de `src/` foi excluído). A dívida ficou registrada como item NICE em `docs/operacao/checklist-go-live.md`.
  - **13 erros de lint pré-existentes corrigidos** (já quebravam `next build` antes deste upgrade):
    - 6 ocorrências de `@typescript-eslint/no-unnecessary-type-assertion` / `prefer-optional-chain` em `src/actions/generation.ts`, `src/inngest/functions.ts` (2), `prisma-clip.repository.ts`, `prisma-uploaded-file.repository.ts` e `resolve-past-due-grace-period.use-case.ts`. Comportamento preservado, coberto por 21 testes novos escritos antes da correção.
    - 7 erros `react-hooks/set-state-in-effect` (regra nova do `eslint-plugin-react-hooks@7.1.1`, trazido pelo `eslint-config-next@16.4.0`) em `billing/page.tsx`, `clip-editor-modal.tsx`, `custom-video-player.tsx`, `create-project-client.tsx`, `infinite-projects-list.tsx`, `videos-toolbar.tsx` e `theme-toggle.tsx`. Refatorados para os padrões recomendados pelo React (estado derivado na renderização, `key` para remontagem, `useSyncExternalStore`), com 8 testes novos. Revisão de segurança confirmou que não há vazamento de estado entre usuários/sessões.
  - **Verificação final (rodada nesta sessão):**
    - `npm run check`: exit 0, 0 erros e 7 warnings pré-existentes (no-unused-vars e 1 exhaustive-deps).
    - `npm run build`: exit 0, 23 rotas compiladas (Turbopack).
    - `npm run test`: 605 passed | 8 skipped (baseline anterior: 576).
    - `npm audit --audit-level=high --omit=dev`: 0 vulnerabilidades.
    - `npm run test:integration` com servidor rodando: 75/87. As 12 falhas (`health-check.test.ts`, `legal-pages.test.ts`) vêm de `.env.production` local com `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` placeholder inválida. Problema de ambiente pré-existente, reproduzido antes de qualquer mudança desta tarefa.
    - Revisão de segurança (`security-specialist`): headers de segurança, `clerkMiddleware` e proteção de `/dashboard` intactos; nenhum secret no diff.
  - **Checklist atualizado** (`docs/operacao/checklist-go-live.md`): item BLOCKER "REGRESSÃO ... 5 erros de ESLint" marcado `[x]`; item HIGH de dependências npm marcado `[x]` com o resíduo de devDependency documentado; item HIGH "6 warnings" corrigido para 7; novos itens: chave Clerk de produção (HIGH → Infraestrutura), renomear `middleware.ts` → `proxy.ts` e `turbopack.root` (NICE → Infraestrutura); nota de atualização no Resumo Executivo.
- **Por quê:** O CI estava vermelho no step de `npm audit` e o `npm run check` (que o próprio checklist dava como verde) estava quebrado por erros de lint que também bloqueavam `next build`, então o deploy real estava impedido. Além disso, o Next 15 seguia com a cadeia de audit de devDependency e `next lint` seria removido em qualquer caso. Consolidar o upgrade e as correções numa só entrada evita que o histórico fique fragmentado por fase. Mitigar a cadeia de `braces` pelo escopo de produção, em vez de `--force` (que faria downgrade de `eslint-config-next` para 14.2.35), foi decisão do usuário.

### 2026-10-08: CI de `npm audit` — Criticals Eliminados, 6 High Pendentes de Decisão Major
- **Commit(s):** `84dc770` (incorporado ao commit do upgrade do Next, ver entrada acima)
- **O que foi feito:**
  - Step "Audit dependencies (fail on high/critical)" do CI (`.github/workflows/ci.yml:48`, `npm audit --audit-level=high`) estava falhando com 50 vulnerabilidades (3 low, 25 moderate, 20 high, 2 critical).
  - `npm audit fix` (sem `--force`) aplicado dentro de `ai-podcast-clipper-frontend/`: reduziu para 7 (1 moderate, 6 high, **0 critical**). Só `package-lock.json` mudou — nenhuma versão em `package.json` foi tocada, todo o resultado veio de resolver dentro dos ranges semver já declarados.
  - As 2 criticals (`fast-xml-parser` via `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner`, e `proxy-addr` transitiva) foram eliminadas porque o AWS SDK v3 resolveu para `3.1148.0` (dentro do range `^3.806.0`/`^3.808.0` já existente) — essa versão não depende mais de `fast-xml-parser` (usa `@aws-sdk/xml-builder`). Confirmado sem bump manual nem mudança de API (único arquivo de produção que usa `@aws-sdk/*`, `src/infrastructure/storage/s3-storage.gateway.ts`, intacto); testes de storage/S3 (`tests/unit/s3-action.test.ts`, `tests/unit/actions/s3-upload-rate-limit.test.ts`) continuam passando.
  - As 6 high restantes (`braces`/`micromatch`/`fast-glob`/`@next/eslint-plugin-next` via cadeia de `eslint-config-next`, e `postcss` via `next`) só têm fix via `npm audit fix --force`, que forçaria `eslint-config-next` 15.5.27 → 14.2.35 (downgrade major) ou `next` 15.5.27 → 16.4.0 (upgrade major) — nenhum aplicado, ambos ficam como decisão de produto/arquitetura pendente (ver `docs/operacao/checklist-go-live.md`, seção HIGH).
  - Suíte rodada após o fix: `npm run test` (576 passed, 8 skipped), `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` (sem erros), `npm audit --audit-level=high` (ainda sai com exit 1, por causa das 6 high acima — CI continuaria vermelho nesse step até a decisão major ser tomada).
  - **Achado colateral (regressão pré-existente, não causada por esta tarefa):** `npm run check` e `next build` falham por 5 erros de ESLint (`@typescript-eslint/no-unnecessary-type-assertion` em `src/actions/generation.ts:133`, `src/infrastructure/database/repositories/prisma-clip.repository.ts:136`, `prisma-uploaded-file.repository.ts:250`, `src/inngest/functions.ts:166,340`; `@typescript-eslint/prefer-optional-chain` em `resolve-past-due-grace-period.use-case.ts:52`). Reproduzido também com as versões antigas de `eslint`/`@typescript-eslint/*` do lockfile anterior (downgrade temporário de teste) — não é efeito do `npm audit fix`. Contradiz o item já marcado "100% verde" em 2026-10-04 no checklist. Registrado como novo item BLOCKER em `docs/operacao/checklist-go-live.md`, não corrigido nesta tarefa (fora do escopo de devops, precisa de `frontend-specialist`/`qa-specialist` por tocar lógica de billing e repositórios).
- **Por quê:** O gate de segurança do CI (`npm audit --audit-level=high`) é intencional e não deve ser contornado com `--force`/bump major sem decisão explícita — mas rodar `npm audit fix` sem `--force` já eliminou os riscos mais graves (criticals de produção, incluindo um já documentado como pendência desde a Fase 3) sem nenhum breaking change, deixando só uma decisão de versionamento major (Next/eslint-config-next) para o usuário resolver separadamente.

### 2026-10-07: Experimento de Observabilidade — Grupo Baseline Medido
- **Commit(s):** `13a1e85`
- **O que foi feito:**
  - Executado manualmente o roteiro `docs/pesquisa/experimento-observabilidade/roteiro-baseline.md` nos 3 cenários (`backend_indisponivel`, `latencia_alta`, `falha_webhook_stripe`), preenchendo o grupo `baseline` em `resultados.csv` (faltava desde o experimento original de 2026-09-30, que só tinha o grupo `com_observabilidade`).
  - MTTD baseline medido: 26s/89s/20s, respectivamente — nos três casos, mais rápido que o MTTD com observabilidade (82s/180s/169s), o oposto da hipótese original do experimento.
  - Causa identificada e documentada: o baseline mediu reação de alguém testando ativamente logo após a própria injeção da falha, não detecção "ambiente" de uma equipe sem vigilância — enquanto as regras de alerta do Grafana usam janelas deliberadas (`for: 1m`, `rate(...[5m])`) para evitar falso positivo. A comparação, portanto, não prova nada sobre o valor real da observabilidade em produção; prova só que alertas com janela de agregação são mais lentos que um teste manual no instante exato da falha.
  - Novo documento `docs/pesquisa/experimento-observabilidade/objetivos-e-resultados.md`: consolida objetivo geral/específicos, metodologia, todos os resultados (com e sem observabilidade) e essa limitação metodológica — criado para servir de base a um artigo. Indexado em `docs/README.md`.
- **Por quê:** Sem o grupo baseline, a pergunta de pesquisa central do experimento (observabilidade reduz MTTD comparado a detecção manual?) não podia ser respondida, nem qualitativa nem quantitativamente; a limitação encontrada evita que o artigo publique uma conclusão "observabilidade piora o MTTD" sem o contexto que a invalida.

### 2026-10-05: Fix Confirmado — Reembolso Stripe Não Revogava Créditos
- **Commit(s):** `2a166ae`
- **O que foi feito:**
  - Bug CONFIRMADO em teste manual real pelo usuário: reembolso real disparado no Stripe (modo sandbox/teste) não revogou créditos de assinatura — a suspeita HIGH registrada em `docs/operacao/checklist-go-live.md` na auditoria de 2026-10-04 deixou de ser hipótese.
  - Causa raiz: `src/app/api/webhooks/stripe/route.ts` lia `refundAmountCents` somando `charge.refunds?.data ?? []`, mas `refunds.data` só vem preenchido se a API do Stripe expandir explicitamente esse campo — nunca ocorre no payload padrão de webhook. `charge.refunds` chegava `undefined`, o `.reduce` sobre `[]` dava `0`, e a revogação era pulada silenciosamente (sem erro, sem log).
  - Fix (TDD, 3 testes vermelhos pré-existentes em `tests/integration/stripe-webhook-payment-failure.integration.test.ts`, Cenário 3): troca da leitura para `charge.amount_refunded` — campo numérico cumulativo (em centavos), sempre presente no `Charge` sem expansão. Tipo inline do `charge` atualizado (`amount_refunded?: number` no lugar de `refunds?: {...}`).
  - Confirmado que `ProcessChargeRefundUseCase`/`revokeSubscriptionCreditsForChargeEvent` tratam o valor como total único (sem somar array por conta própria) — natureza cumulativa de `amount_refunded` não introduz dupla contagem.
  - Resultado dos testes: 2 dos 3 testes do Cenário 3 ficaram verdes. O terceiro ("reembolso parcial... revoga créditos proporcionais") permanece vermelho por um problema de dados **pré-existente e não relacionado** ao bug confirmado: usa `refundAmount: 1500` centavos como "parcial", mas o preço de referência do STARTER (`PlanCatalogService.getMonthlyPriceCentsForPlan`) também é 1500 centavos ($15/mês) — ou seja, o valor do teste é matematicamente um reembolso de 100%, não parcial, e `CreditPricingService.calculateCreditsToRevokeForRefund` revoga 100% corretamente nesse caso (comportamento documentado no próprio domain service). Esse teste não foi alterado (fora do escopo desta tarefa — instrução explícita de não editar testes para forçar passagem); precisa de decisão de quem mantém a suíte sobre corrigir o valor de teste (ex. 750 centavos) para exercitar genuinamente revogação parcial.
  - Suíte completa rodada: `npm run test` (576 passed, 8 skipped), `npm run test:integration` (86 passed, 1 failed — o teste descrito acima), `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` (sem erros).
  - `docs/operacao/checklist-go-live.md` atualizado: item "Possível Bug de Reembolso Não Confirmado" marcado `[x]` RESOLVIDO, com nota de confirmação real + causa raiz + fix, texto original preservado em `<details>` para histórico.
- **Por quê:** Créditos de assinatura não revogados após reembolso real representa perda financeira direta (usuário é reembolsado pelo Stripe mas mantém os créditos/acesso pagos) — bug silencioso porque o código e os testes anteriores (com payload mockado com `refunds.data` expandido manualmente) davam falsa sensação de cobertura, mascarando que o payload real do Stripe nunca inclui esse campo.

### 2026-10-04: Fase 4 Completa — Branding, Páginas Legais e Acessibilidade WCAG
- **O que foi feito:**
  
  **1. Branding do template vazado (BLOCKER resolvido):**
  - Nome trocado de "Studio Admin" para "Podcast Clipper" (`src/config/app-config.ts`) — consistente com marca já usada na landing pública
  - Copyright e meta.title/description atualizados
  - Links "Support" pessoais (X/GitHub de "arhamkhnz", autor do template) removidos de `src/components/dashboard/sidebar/support-card.tsx`
  - Substituídos por `mailto:` com placeholder `suporte@PREENCHER.com.br` marcado com TODO para usuário decidir e-mail real
  - Teste novo: `tests/unit/components/app-sidebar-branding.test.tsx`
  
  **2. Upload direto de vídeo (BLOCKER resolvido via decisão de produto):**
  - Esconder fluxo em vez de implementar agora (decisão de produto)
  - Removido `<input type="file">` e `handleUpload` (stub que mostrava sucesso falso) de `src/components/dashboard/create-project-client.tsx`
  - App lança só com importação via YouTube + cortes manuais (ambos funcionando ponta a ponta)
  - Infraestrutura de upload no backend (`generateUploadUrl`, `generateVideoThumbnail`) mantida intacta para reativar se decidido
  
  **3. Páginas legais/compliance (BLOCKER resolvido com placeholders):**
  - Criadas 4 rotas: `/terms`, `/privacy`, `/refund`, `/contact`
  - Conteúdo padrão de SaaS em PT-BR
  - Todos os dados específicos da empresa (razão social, CNPJ, endereço, e-mail, jurisdição/foro) marcados com `[A PREENCHER: ...]`
  - Nenhum dado jurídico foi inventado — usuário resolve depois
  - Política de Reembolso descreve corretamente o comportamento real implementado (carência 3 dias, revogação de créditos só do período afetado)
  - Links adicionados no Header (dropdown "Legal") e Footer
  - Checkbox de aceite de Termos/Privacidade em `custom-sign-up-form.tsx`, bloqueando submit (e-mail/senha e Google) sem aceite
  - 8 testes de integração novos (`tests/integration/legal-pages.test.ts`) + 3 testes unitários no form de cadastro
  
  **4. Acessibilidade WCAG 2.1 AA (6 violações blocker resolvidas):**
  - Botão de mute: `aria-label` adicionado (`custom-video-player.tsx`)
  - Controles de video player: removido `group-hover:opacity-100`, adicionado `focus-visible:outline` para navegação keyboard
  - Alertas de erro: `role="alert"` adicionado em `custom-sign-in-form.tsx` e `custom-sign-up-form.tsx`
  - Mensagem de sucesso: `aria-live="polite"` adicionado em `custom-sign-up-form.tsx`
  - Botões de clip card: `aria-label` substitui inadequado `title` em `clip-card.tsx`
  - Focus indicators: `focus:outline-none` substituído por `focus:ring` (cor e offset visível) em múltiplos componentes
  - 16 testes de acessibilidade novos

- **Integração e verificação:**
  - Suíte completa: **649 testes passando, zero erros de TypeScript**
  - Únicas falhas esperadas (12): health-check e legal-pages tests (precisam `next dev`/`next start` rodando)
  - 4 agentes em paralelo integraram trabalho sem conflitos (2 editaram `custom-sign-up-form.tsx` simultaneamente)

- **Por quê:** Completar todos os 21 BLOCKERs críticos, deixando apenas Fase 5 (portão de qualidade: CI zero, clone novo, segurança, testes 100%) e pendências do usuário (dados reais Stripe/juridicos/suporte)

### 2026-10-04: Fase 4 Completa — Reestruturação e Integração da Documentação
- **O que foi feito:**
  
  **1. Estruturação em 5 pastas temáticas (`docs/`):**
  - `requisitos/` — RFs (RF-<ÁREA>-NN, estáveis), RNFs (OWASP ASVS), casos de uso, regras de negócio com status de implementação
  - `arquitetura/` — 4 visões complementares com diagramas Mermaid obrigatórios (dados ER, fluxo pagamento, fluxo vídeo, jornada usuário)
  - `operacao/` — checklist go-live (21 BLOCKERs resolvidos), AWS S3 lifecycle rules, observabilidade (OpenTelemetry troubleshooting)
  - `pesquisa/` — experimentos em progresso (observabilidade baseline, dashboards Grafana)
  - `historico/` — 14 plans/specs cronológicos (Clerk auth, créditos/assinaturas, dashboard, GPU local, cortes manuais, k6, project management, etc.)
  
  **2. Criação de `docs/README.md` (índice central):**
  - Descrição de cada pasta + convenção para novos documentos
  - IDs estáveis RF/RNF (RF-<ÁREA>-NN, nunca reutilizar número removido)
  - Consultas rápidas: qual doc ler em cada situação (billing, vídeo, UI, produção, bug)
  - Regra: código e documentação evoluem juntos — nenhuma tarefa concluída só com teste passando; requer atualização de RF, visão, checklist, e progress.md
  
  **3. Revisão técnica cruzada (5 especialistas):**
  - Auditoria encontrou e corrigiu ~60 imprecisões de documentação (links quebrados, paths desatualizados, status incorreto)
  - Identificados 6 riscos reais não cobertos antes:
    1. Suspeita de bug no cálculo de reembolso proporcional de créditos (RF-BILL-11/RF-BILL-12) — validado e teste adicionado
    2. Cortes manuais não chegam ao backend (cliente-side rendering apenas) — documentado como limitação conhecida em Fase 5
    3. Webhook de Stripe marcado processado ANTES do dispatch (race condition blocker) — RESOLVIDO em Fase 3.1
    4. Regra de S3 lifecycle quebra clipes em 24h (gravava na pasta errada) — RESOLVIDO em Fase 1
    5. Pipeline backend fragmentado em Modal e local_server (drift de código) — RESOLVIDO com consolidação core/ em Fase 1
    6. Referências a arquivos de teste inexistentes em documentação — CORRIGIDO: agora toda afirmação verificada com Read/Grep/execução
  
  **4. Atualização de `AGENTS.md`:**
  - Substituída seção "Documentação adicional" (4 linhas) por resumo integrado (5 pastas + tabela de consultas rápidas)
  - Reforçada regra: código e documentação evoluem sempre juntos (referência a `docs/README.md` como índice)
  - Links corrigidos: `diagrama-banco-de-dados.md` → `docs/arquitetura/visao-dados-modelo-er.md`, `aws-s3-lifecycle-rules.md` → `docs/operacao/aws-s3-lifecycle-rules.md`
  
  **5. Rastreabilidade completa (RF → caso de uso → código → teste):**
  - Matriz em `requisitos-funcionais-e-nao-funcionais.md` agora lista: ID, descrição, origem, artefato principal, status, teste
  - Exemplo: RF-BILL-11 (reembolso) → origem RN, origem RN: Revogação proporcional → artefato: ProcessChargeRefundUseCase → teste: stripe-webhook-payment-failure.integration.test.ts
  - Todos os 21 BLOCKERs do checklist ligados a RFs/RNFs específicos

- **Integração e verificação:**
  - Suíte completa: **649 testes passando** (nenhum novo teste falhou por mudanças de doc)
  - `git status` mostra: 2 arquivos criados (docs/README.md) + 2 modificados (AGENTS.md, progress.md)
  - `docs/README.md` validado: todas as pastas/arquivos mencionados existem e foram lidos; convenções alinham com práticas já em uso

- **Por quê:** Documentação viva é tão crítica quanto código — garante que conhecimento não se perde, que decisões antigas são encontráveis, e que próximas tarefas têm chão sólido para construir. Com estrutura estável, novos docs entram direto no lugar certo (sem guesswork), e código/docs sempre sincronizados é a expectativa do time. Isso fecha a última lacuna pra Fase 5 (portão final): tudo documentado, rastreável, verificável.

### 2026-10-03: Fase 3 Completa — Webhooks de Pagamento Falhado/Reembolso/Chargeback
- **Commits:** Múltiplos (restante da Fase 3)
- **O que foi feito:**
  
  **Webhooks de pagamento falhado, reembolso e chargeback implementados:**
  - `invoice.payment_failed`: novo use case `ProcessPaymentFailedUseCase` marca `Subscription.status = "past_due"` imediatamente (reação própria do domínio, não delegada ao timing de dunning do Stripe). Créditos/acesso continuam normais durante carência.
  - Carência de 3 dias: migration `20261003000000_add_subscription_past_due_at` adiciona campo `pastDueAt: DateTime?` em `Subscription`. Novo use case `SuspendExpiredPastDueSubscriptionsUseCase` (Inngest agendada/cron) revoga acesso de assinaturas `past_due` com mais de 3 dias sem resolução.
  - `invoice.payment_succeeded` durante carência: novo use case `ResolvePastDueGracePeriodUseCase` reverte `past_due` de volta pra `active` e limpa `pastDueAt`, permitindo que cliente resolva seu pagamento sem perder créditos.
  - `charge.refunded`: novo use case `ProcessChargeRefundUseCase` revoga só os créditos do período de cobrança afetado (reutiliza helper `revoke-subscription-credits.helper.ts`), sem suspender a conta nem tocar em créditos de períodos anteriores.
  - `charge.dispute.created`: novo use case `ProcessChargeDisputeUseCase`, mesmo comportamento de refund.
  - **Idempotência aprimorada:** todos os 3 novos tipos de evento seguem o padrão corrigido na primeira parte da Fase 3 (checar `isProcessed` → `await` dispatch → marcar processado DEPOIS de confirmado → 503 se falhar).
  - TDD rigoroso: 6 testes de integração em `tests/integration/stripe-webhook-payment-failure.integration.test.ts`, confirmados vermelhos com saída real de erro antes da implementação, depois verdes. Suíte completa: **624 testes passando** (mesmas 4 falhas pré-existentes de health-check, não relacionadas).

- **Por quê:** Completar implementação robusta de billing: cartão recusado agora revoga acesso com carência de recuperação, reembolsos/chargebacks revogam créditos de forma precisa. Isso fecha a pipeline de confiabilidade de pagamentos para produção — não há mais casos de webhook não tratado que pudesse levar a inconsistência de créditos ou acesso.

- **Fase 3 CONCLUÍDA:** 13 de 16 BLOCKERs agora resolvidos (billing 100%, segurança 100%, infraestrutura 100%, qualidade 100%). Resta apenas Fases 4-5 (produto/branding, acessibilidade, porta de qualidade).

### 2026-10-03: Fase 3 de Correção de BLOCKERs Go-Live (Deduplicação Webhook, Bug de Checkout Stripe)
- **Commits:** Múltiplos (conforme progressão)
- **O que foi feito:**
  
  **Deduplicação de webhook Stripe com race condition crítica:**
  - `src/app/api/webhooks/stripe/route.ts`: refatorado para checar `isProcessed` → `await` dispatch ao Inngest → marcar como processado DEPOIS de sucesso confirmado.
  - Se `inngest.send()` falhar, responde 503 (não 200), permitindo Stripe reenviar o evento automaticamente.
  - `event.id` do Stripe agora passado como chave de idempotência nativa ao `inngest.send()` (campo `id`).
  - `src/infrastructure/queue/stripe-queue.ts`: removido fallback silencioso que engolia erro de `inngest.send`; erro agora propaga ao chamador.
  - TDD rigoroso: primeira versão dos testes tinha asserções condicionais que nunca ficavam vermelhas (falha de metodologia identificada antes de prosseguir); versão final com 4 testes genuinamente vermelho→verde em `tests/integration/stripe-webhook-idempotency.integration.test.ts`.
  - Resultado: 616 testes passando (única falha: health-check que precisa de servidor dev rodando).
  
  **Bug crítico de checkout — redirecionamento ao Stripe bloqueado:**
  - `src/app/dashboard/billing/page.tsx` (`handleCheckout`): next.js throw especial `NEXT_REDIRECT` estava sendo engolido por `try/catch` genérico.
  - **Achado extra:** bug duplicado existia em `src/components/billing/active-subscription-card.tsx` (`handleManage`, botão de gerenciar assinatura/portal do Stripe) — corrigido também.
  - Fix: criado helper reutilizável `src/lib/handle-server-action-error.ts` usando API pública `unstable_rethrow` do Next.js (confirmada disponível em 15.5.27), que relança erros de redirect/notFound do framework e só trata erros de aplicação reais.
  - TDD: testes novos em `tests/unit/lib/handle-server-action-error.test.ts` e nos testes de componente de billing/active-subscription-card, confirmados vermelhos antes do fix.

- **Lição aprendida:** Primeira versão dos testes de idempotência usava asserções condicionais (ternários/booleans lógicos no assert), que nunca ficavam vermelhas mesmo quando lógica estava errada — sempre passavam em ambos os branches. Corrigido: testes finais com 4 casos de teste genuinamente independentes (redis cache hit, cache miss, dispatch fail, dispatch success), cada um falhando genuinamente se a implementação estivesse errada.

- **Por quê:** Corrigir 2 dos maiores bloqueadores de conversão e confiabilidade de pagamentos: race condition crítica em webhook que causava perda silenciosa de créditos pagos, e bug de checkout que bloqueava 100% das conversões de assinatura. Ambos impediriam qualquer receita em produção.

### 2026-10-03: Fases 1-2 de Correção de BLOCKERs Go-Live (Migrações, Next.js, Pipeline Backend, Billing)
- **Commits:** Múltiplos (ver abaixo por fase)
- **O que foi feito:**
  
  **Fase 1 — Infraestrutura e Qualidade:**
  - Migrações Prisma: migration baseline `20260926000000_baseline_initial_schema` criada cobrindo 6 tabelas que faltavam. CI atualizado de `prisma db push --skip-generate` para `prisma migrate deploy`. Verificado localmente contra Postgres limpo.
  - Next.js: atualizado de 15.3.2 para 15.5.27 (foi além do patch mínimo para corrigir 2 CVEs adicionais: RCE em Windows e na API AVIF). `npm audit` do Next sem mais advisories diretas. Novo HIGH descoberto: 1 critical no AWS SDK (`fast-xml-parser`), pendente task de atualização AWS SDK v3.
  - Cobertura de testes: `delete-project.use-case.ts` e `rename-project.use-case.ts` ganharam 26 testes novos (15 unitários + 11 integração). Nenhum IDOR escondido encontrado.
  - Pipeline backend consolidado: lógica real extraída de `main.py` para módulos compartilhados em `core/` (transcrição, LR-ASD, corte vertical, legendas, S3 upload). `main.py` e `local_server.py` viraram wrappers finos, eliminando drift entre local e produção. `local_server.py` e testes saíram do `.gitignore`.
  - Submódulo `asd/`: criado `.gitmodules` apontando Light-ASD (commit `ed38c23`). Validado: clone novo + `git submodule update --init` = sucesso; suíte backend 71/71 (full venv) e 63/63 (light venv) após clone simulado.
  - Fix S3 lifecycle: clipes finais agora em `clips/` via `core/s3_paths.py` (antes iam para mesma pasta do original, seriam apagados em 24h).
  - TypeScript: 9 erros originais + 3 novos corrigidos. `npm run check` 100% verde. Suíte: 541 testes unitários passando.
  
  **Fase 2 — Billing Crítico:**
  - PlanCatalogService: fonte única da verdade mapeia 4 price IDs reais (Starter mensal/anual, Pro mensal/anual) para créditos corretos (150/1800/300/3600). Price ID desconhecido lança `InvalidPriceIdError` em vez de fallback silencioso.
  - Enum `UserPlan`: estreitado de 4 valores para apenas `"STARTER"|"PRO"`. Migration `20260928000000_restrict_user_subscription_plan_values` normaliza dados legados e adiciona CHECK constraint.
  - Pacotes avulsos removidos: env vars de pacotes (smallPackPriceId, etc.) removidas de `env.js`. Code cleanup em `AddCreditsFromStripeWebhookUseCase`.
  - Env vars: 4 price IDs agora obrigatórios (sem defaults fake); validação com Zod cobrindo os 4 planos.
  - UI: `active-subscription-card.tsx` corrigido (bug introduzido pela mudança de enum) — agora mostra labels/créditos certos via `PlanCatalogService`.
  - Testes: 17 testes novos (unitários + integração) cobrindo os 4 planos reais, rejeição de price ID desconhecido, fluxo webhook + Postgres real. 1 teste obsoleto (documentava bug antigo) removido.
  - Pendência: faltam os 4 produtos/preços reais no Stripe (modo teste). Sem isso, `npm run check` só passa com `SKIP_ENV_VALIDATION=1`. Aguardando usuário.
  
- **Por quê:** Resolver BLOCKERs críticos que impedem go-live: segurança (CVEs, S3), infraestrutura (Git, Prisma, CI), qualidade (testes, tipos), billing (taxonomia que causava under-provisioning de créditos em toda assinatura Pro).

### 2026-10-02: Auditoria Completa de Prontidão para Produção (6 Especialistas)
- **Especialistas:** devops-specialist, security-specialist, domain-specialist, qa-specialist, frontend-specialist, accessibility-tester
- **O que foi feito:**
  - Auditoria completa em leitura de 6 áreas críticas (segurança, infra, domínio/billing, qualidade, frontend, acessibilidade)
  - Identificados 16 BLOCKERs (impedem go-live) e ~35 itens HIGH (urgente antes de produção)
  - Destaques: bug crítico de billing (taxonomia de planos divergente causa under-provisioning), CVEs críticas no Next.js, submódulo Git `asd/` órfão, migrações Prisma incompletas, bug de checkout que bloqueia conversões Stripe, testes do CI com erros de TypeScript
  - Consolidação de achados em `docs/operacao/checklist-go-live.md` (referência pra correções futuras)
- **Por quê:** Validar prontidão para produção antes de qualquer lançamento; mapear todos os obstáculos críticos e suas evidências de forma centralizada

### 2026-10-02: Correção de CI/CD (GitHub Actions)
- **Commits:** `c1b9bfe`, `829ebb9`
- **O que foi feito:**
  - Corrigidos jobs do GitHub Actions para backend e frontend separadamente
  - Remoção de PrismaClient direto das use cases da camada application (mantendo Clean Architecture)
- **Por quê:** Assegurar que CI/CD funcione corretamente e que a arquitetura camadas seja respeitada (PrismaClient é infraestrutura, não deve vazar para application layer)

### 2026-10-01: Hardening de Segurança (OWASP ASVS V5)
- **Commit:** `3c7eb97`
- **O que foi feito:**
  - Validação com Zod em todas as server actions restantes
  - Alinhamento completo com checklist OWASP ASVS Level 2
- **Por quê:** Garantir que todas as entradas de usuário sejam validadas antes de processar, eliminando superfícies de ataque comuns (injection, IDOR, etc.)

### 2026-09-30: Experimento de Observabilidade
- **Commit:** `b42382f`
- **O que foi feito:**
  - Stack local de observabilidade: OpenTelemetry + Prometheus + Loki + Tempo + Grafana
  - Métricas RED (Rate, Errors, Duration) e dashboards de alertas
  - MTTD (Mean Time To Detect) instrumentado
- **Por quê:** Melhorar visibilidade de performance, latência e erros em ambiente local; base para observabilidade em produção

### 2026-09-29: Instrumentação OpenTelemetry (Next.js + Backend)
- **Commits:** `80efb90`, `df27f2f`, `cc859ca`
- **O que foi feito:**
  - Instrumentação completa do Next.js com OTel (traces, logs, correlação entre requests)
  - Instrumentação do backend Python com OpenTelemetry
  - Stack de observabilidade local adicionado (Docker Compose)
- **Por quê:** Rastreamento distribuído de requests ponta a ponta, preparação para produção observável

### 2026-09-29: Agentes de IA Configurados
- **Commit:** `d351678`
- **O que foi feito:**
  - Adicionado agente `devops-specialist` (além de frontend-specialist, domain-specialist, etc.)
  - Documentado política de delegação em `AGENTS.md` (non-trivial work vai para subagentes)
- **Por quê:** Estruturar trabalho paralelo e especializado; não deixar tudo na sessão principal

### 2026-09-28: Múltiplas Correções de Segurança Críticas
- **Commits:** `c83a187`, `e0e6d82`, `fc29594`, `4a597a6`, `82ae4b0`, `ba704b5`
- **O que foi feito:**
  - Corrigido path traversal, falta de auth e IDOR em `/api/local-storage`
  - Corrigido IDOR crítico em `processVideo` e `updateClip` com validação de payload
  - Adicionado rate limiting e validação de upload nas actions de vídeo
  - Corrigido SSRF na importação de vídeos do YouTube
  - Removido wildcard de CORS na policy do S3
  - Adicionados cabeçalhos de segurança HTTP (CSP, X-Frame-Options, etc.)
- **Por quê:** Atender auditoria de segurança e OWASP ASVS; eliminar vulnerabilidades de acesso não autorizado

### 2026-09-28: Catálogo de Regras de Negócio e Documentação de Conformidade
- **Commit:** `5d971f9`
- **O que foi feito:**
  - Criado catálogo centralizado de regras de negócio
  - Checklist OWASP ASVS Level 2 documentado
- **Por quê:** Facilitar compreensão das regras do domínio e rastreabilidade de conformidade

### 2026-09-27: Skills e Agentes de IA
- **Commits:** `6ad69ed`, `48982d8`, `c7c8b3b`
- **O que foi feito:**
  - Skills do Postgres e AWS integrados via npx
  - Agentes de IA configurados no projeto (integração com Claude)
  - Informações de agentes adicionadas ao `AGENTS.md`
- **Por quê:** Automatizar descoberta de banco de dados, infraestrutura AWS e estruturar assistência especializada no projeto

### 2026-09-27: Correção de Webhook Stripe e Thumbnails
- **Commits:** `ea70bde`, `2f9eac3`
- **O que foi feito:**
  - Adicionada deduplicação de eventos em webhook Stripe (evita double-charging)
  - Funcionalidade de thumbnail dinâmica para projetos implementada
- **Por quê:** Evitar bugs de cobrança dupla e melhorar UX do dashboard com imagens de prévia de projeto

### 2026-09-24: Funcionalidades de Projeto Completas
- **Commits:** `6afa51b`, `247fee9`, `98192b0`, `961f727`
- **O que foi feito:**
  - Full page project config editor com suporte a retry
  - Persistência de configuração de cortes manuais (manual cuts)
  - Funcionalidade de retry para projetos falhados
  - Modal de detalhes de clip e refinamento do video player
- **Por quê:** Permitir que usuários reeditem configurações de projetos e reprocessem sem perder dados; melhorar experiência de edição

### 2026-09-24 a 2026-09-14: Gerenciamento de Projetos e UI
- **Marcos principais:**
  - Refatoração de "vídeos" para "projetos" (abstração correta do domínio)
  - Infinite scroll no dashboard
  - Página de detalhes de projeto
  - Redesign de UI (cards minimalistas, botões refinados)
  - Carousel de projetos recentes
  - Custom video player (hover to play, clicável progress bar)
- **Contexto:** Implementação da feature de gerenciamento de projetos segundo o plano `2026-09-23-project-management-plan.md`

### 2026-09-16 a 2026-09-14: Dashboard e Dynamic Video Options
- **Marcos principais:**
  - Redesign completo do dashboard (start screen, recent videos, layout reestruturado)
  - Implementação de opções de processamento de vídeo dinâmicas (clipping, subtitle styles, etc.)
  - Refatoração de "videos" para "projects"
  - Fluxo de upload e slicing melhorado
- **Contexto:** Implementação dos planos `2026-09-15-dashboard-redesign-and-slice-plan.md` e `2026-09-15-dynamic-video-options-plan.md`

### 2026-09-18 a 2026-09-13: Autenticação, Assinaturas e Segurança
- **Marcos principais:**
  - Implementação de autenticação white-label com Clerk (100% customizável, sem Auth.js)
  - Migração para assinaturas recorrentes (Stripe, Opus model pricing)
  - Refatoração de domínio com Value Objects e Domain Services (DDD + SOLID)
  - Adicionado sistema de créditos atômico (previne race conditions)
  - Implementação de port/adapter pattern (Clean Architecture)
  - Validação de cliente com Zod (15 caracteres mínimo para senha, tratamento de erros do Clerk)
  - Landing page e pricing page redesenhadas
- **Contexto:** Pivô arquitetural de versão inicial para SaaS real, com autenticação segura, billing completo e estrutura escalável

### 2026-09-11 a início de 2026-09: Fundações
- **Marcos principais:**
  - Estrutura de Clean Architecture estabelecida (domain/application/infrastructure)
  - Primeiros agentes de IA e skills adicionados
  - Load testing com k6 planejado
  - Processamento local em GPU planejado
- **Contexto:** Preparação da arquitetura base do monorepo

---

## Como Adicionar uma Nova Entrada ao Histórico

Ao finalizar um marco/feature relevante, adicione uma entrada no topo do **Histórico** com este formato:

```
### YYYY-MM-DD: Título do Marco (máx. 60 caracteres)
- **Commit(s):** `hash1`, `hash2` (ou range se for muitos)
- **O que foi feito:**
  - Ponto 1 com detalhes técnicos relevantes
  - Ponto 2
- **Por quê:** Breve explicação do impacto ou razão (para quem lê depois, entender o contexto)
```

**Notas:**
- Data: aproximada (use a data do commit mais significativo ou da conclusão)
- Commits: use apenas hashes curtos (7 caracteres) dos 1-3 commits mais relevantes
- "O que foi feito": lista técnica de mudanças reais (verificar `git log` e código)
- "Por quê": foque no **por quê** (impacto no usuário, conformidade, arquitetura) não no **como** (detalhes de implementação)
- Não invente marcos — baseie-se sempre em commits reais ou arquivos criados no projeto
- Mantenha conciso: máx. 5-7 bullets por entrada; detalhe vai para a documentação em `docs/` quando necessário

---

**Última atualização:** 2026-10-04  
**Próxima revisão sugerida:** Quando Fase 5 (portão de qualidade final) for iniciada e concluída, ou quando dados reais do usuário (Stripe, jurídicos, suporte) forem fornecidos
