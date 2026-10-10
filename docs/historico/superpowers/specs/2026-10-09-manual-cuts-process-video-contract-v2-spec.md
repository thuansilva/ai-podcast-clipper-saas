# Especificação de Contrato: `POST /process_video` v2 (modo manual vs. automático)

- **Data:** 2026-10-09
- **Status:** Aprovado para implementação (Fase 0 de um plano de 3 fases — ver "Fases" abaixo)
- **Autor:** `domain-specialist` (a partir da investigação do `cto`, aprovada pelo usuário)
- **Alvo:** `ai-podcast-clipper-backend/core/schemas.py`, `core/video_pipeline.py`,
  `core/clip_pipeline.py`, `main.py`, `local_server.py` — e, como pré-requisito do
  lado do consumidor, `ai-podcast-clipper-frontend/src/inngest/functions.ts` e
  `src/application/use-cases/retry-project.use-case.ts`.
- **Relacionado:** `RF-PIPE-08` (`docs/requisitos/requisitos-funcionais-e-nao-funcionais.md:81`,
  hoje marcado ⚠️), seção "4. Pipeline de Processamento" de
  `docs/requisitos/casos-de-uso-e-regras-de-negocio.md`, spec original
  `2026-09-13-manual-cuts-timestamp-design.md` (este documento **supersede** as
  regras de duração de corte daquele spec — ver nota na seção 4).

> **Este documento é só especificação (Fase 0).** Nenhum código de produção foi
> alterado. O objetivo é travar o contrato e as regras de negócio antes de
> escrever os testes (Fase 1) e implementar (Fase 2).

---

## 1. Contexto — o que está quebrado hoje

Investigação prévia (`cto`) confirmou que o bug tem dois lados:

1. **Backend descarta campos em silêncio**: `core/schemas.py::ProcessVideoRequest`
   só declara `s3_key` e `preset`. Como o Pydantic v2, por padrão, ignora chaves
   desconhecidas, `mode`, `manual_cuts`, `aspect_ratio`, `auto_zoom` e `genre`
   enviados pelo frontend somem sem erro nenhum.
2. **Frontend já manda o `mode` errado antes disso**: `functions.ts:277` monta
   `mode: video.clipModel ?? event.data.mode ?? "auto"`. `clipModel` é opção de
   **layout** (`"auto"`/`"face_focus"`, `prisma/seed.ts:57-64`), não modo de
   processamento — e tem precedência sobre o `mode` real do evento.
3. **Retry perde o modo manual**: `retry-project.use-case.ts:81` compara
   `updated.clipModel === "manual"`, valor que `clipModel` nunca assume.
4. **Cobrança já é feita no preço certo, resultado não**: `functions.ts:212-224`
   reserva créditos com `calculateManualCutsCredits` quando `isManual`, mas o
   backend sempre roda o pipeline automático — o usuário paga o preço manual e
   recebe o resultado de IA.

Este documento resolve (1) do lado do contrato; (2) e (3) são pré-requisitos do
lado do frontend, descritos na seção 7, mas **fora do escopo de implementação
deste agente/documento** — ficam para quem a Fase 2 designar (ver `AGENTS.md`,
"Uso dos Agentes Especializados").

## 2. Decisões já tomadas (não reabrir)

Aprovadas pelo usuário a partir da recomendação do `cto`:

- **D1** — escopo reduzido agora: só `mode` + `manual_cuts` passam a ter efeito
  funcional. `aspect_ratio`, `auto_zoom`, `genre` são **aceitos no schema, sem
  efeito funcional** — gap conhecido, vira RF novo "pendente" depois, não faz
  parte desta tarefa.
- **D2** — backend usa `extra="forbid"` no Pydantic: campo desconhecido é 422,
  nunca descartado em silêncio.
- **D3** — decorre de D1: `aspect_ratio` aceita qualquer valor por ora (sem
  enum), já que não tem efeito funcional ainda.
- **D4** — regras de cortes manuais: duração máxima 60s (igual ao automático);
  corte que passa da duração real do vídeo é **rejeitado**; cortes sobrepostos
  entre si são **permitidos**; todos os cortes enviados (até o teto de 50 do
  Zod do frontend) são processados — **não** aplicar o `clips_limit=5` do
  automático; a transcrição (WhisperX) continua rodando no modo manual (serve
  às legendas); só `identify_moments`/Gemini é pulado.
- **D5** — `mode="manual"` com `manual_cuts` vazio/ausente é erro de validação
  (422), nunca cai para automático (o crédito já foi reservado no preço do
  modo manual).
- **D6** — `mode` é ortogonal a `clipModel` (layout). No frontend, `mode` deve
  ser **derivado** de `manualCutsJson != null`, não persistido em coluna nova
  (sem migration Prisma).

## 3. Contrato v2 — Request

### 3.1 `ManualCut`

```python
class ManualCut(BaseModel):
    """A single user-defined cut timestamp range for manual mode processing.

    Mirrors `ManualCutDTO` do frontend (`src/application/dtos/video-dtos.ts`)
    no formato de wire enviado por `functions.ts` (`{title, start, end}`).
    """

    model_config = ConfigDict(extra="forbid")

    start: float = Field(..., ge=0, description="Start timestamp of the manual cut, in seconds")
    end: float = Field(..., description="End timestamp of the manual cut, in seconds")
    title: Optional[str] = Field(
        default=None,
        description=(
            "Optional title for the resulting clip. When omitted, the pipeline "
            "falls back to a generated title (\"Manual clip {N}\")."
        ),
    )

    @model_validator(mode="after")
    def validate_duration(self) -> "ManualCut":
        _validate_clip_duration(self.start, self.end, max_seconds=60.0, label="Manual cut")
        return self
```

- `_validate_clip_duration(start, end, max_seconds, label)` é uma função
  compartilhada nova (extraída do corpo de `ClipItem.validate_duration_and_boundaries`,
  hoje duplicado) usada tanto por `ClipItem` (modo automático) quanto por
  `ManualCut` (modo manual), para não duplicar a regra "end > start, duração
  <= 60s" em dois lugares.
- `start`/`end` em segundos, mesma unidade usada em `ClipItem` e em
  `ManualCutDTO` do frontend — sem conversão de unidade na borda.

### 3.2 `ProcessVideoRequest`

```python
class ProcessVideoRequest(BaseModel):
    """Request payload to initiate podcast video processing."""

    model_config = ConfigDict(extra="forbid")  # D2: campo desconhecido -> 422, nunca descartado em silêncio

    s3_key: str = Field(..., description="S3 storage key of the input video file")
    preset: str = Field(
        default="HORMOZI",
        description="Subtitle styling preset: HORMOZI, MINIMAL, NEON, etc.",
    )
    mode: Literal["auto", "manual"] = Field(
        default="auto",
        description=(
            "Processing mode. 'auto' (default) runs Gemini moment "
            "identification over the full transcript. 'manual' skips Gemini "
            "and processes exactly the timestamps given in manual_cuts. "
            "Orthogonal to any clip *layout* option (e.g. face-focus vs. "
            "smart-crop) — never conflate the two."
        ),
    )
    manual_cuts: Optional[List[ManualCut]] = Field(
        default=None,
        max_length=MAX_MANUAL_CUTS,  # = 50, mesmo teto do Zod do frontend (manual-cut.schema.ts)
        description="Required and non-empty when mode='manual'; must be omitted/empty when mode='auto'.",
    )
    aspect_ratio: Optional[str] = Field(
        default=None,
        description=(
            "Accepted for forward-compatibility only. NOT YET implemented — "
            "has no functional effect on this pipeline version (known gap, "
            "tracked as a future RF; core/vertical_video.py only knows how to "
            "produce 9:16 today)."
        ),
    )
    auto_zoom: Optional[bool] = Field(
        default=None,
        description="Accepted for forward-compatibility only. NOT YET implemented — has no functional effect.",
    )
    genre: Optional[str] = Field(
        default=None,
        description="Accepted for forward-compatibility only. NOT YET implemented — has no functional effect.",
    )

    @model_validator(mode="after")
    def validate_mode_and_manual_cuts(self) -> "ProcessVideoRequest":
        if self.mode == "manual" and not self.manual_cuts:
            raise ValueError("mode='manual' requires a non-empty manual_cuts list")
        if self.mode == "auto" and self.manual_cuts:
            raise ValueError("manual_cuts must not be sent when mode='auto'")
        return self
```

Onde `MAX_MANUAL_CUTS = 50` é uma constante nova em `core/schemas.py`, com
comentário apontando para
`ai-podcast-clipper-frontend/src/domain/schemas/manual-cut.schema.ts` (mesmo
valor, validação redundante backend+frontend — mesmo padrão já usado para
validação de host do YouTube, `RF-INGEST-01`/`RF-INGEST-02`).

**Avaliação do default de `mode`** (pergunta explícita da tarefa): `default="auto"`
é seguro mesmo com `extra="forbid"`. `extra="forbid"` só rejeita chaves
**desconhecidas** no payload — um campo conhecido ausente (`mode` não enviado
por um chamador antigo, ex.: o payload de teste em `main.py` `local_entrypoint`,
que hoje só manda `s3_key`/`preset`) continua sendo preenchido pelo valor
default sem erro. Chamadas antigas continuam funcionando sem alteração.

### 3.3 Onde cada validação acontece (importante: nem tudo é Pydantic)

| Validação | Onde | Por quê |
|---|---|---|
| `end > start`, duração ≤ 60s por corte | `ManualCut.validate_duration` (Pydantic, `model_validator`) | Dado síncrono, disponível no corpo da requisição, sem I/O |
| `mode="manual"` ⇒ `manual_cuts` não vazio; `mode="auto"` ⇒ `manual_cuts` ausente | `ProcessVideoRequest.validate_mode_and_manual_cuts` (Pydantic) | Mesma razão — não depende de nada externo |
| Máx. 50 cortes | `Field(max_length=...)` em `manual_cuts` (Pydantic) | Idem |
| Campo desconhecido no payload | `model_config = ConfigDict(extra="forbid")` (Pydantic) | Idem |
| Corte cujo `end` excede a **duração real** do vídeo de origem | `core/video_pipeline.py::run_video_processing_pipeline`, **depois** de `resolve_input_video_path` baixar/copiar o arquivo, **antes** da transcrição | A duração real só é conhecida depois do download/probe (ffprobe) — não dá pra validar isso em `ProcessVideoRequest`, que é avaliado pelo FastAPI/Modal antes de qualquer handler rodar |

A última linha é o ponto que a tarefa pediu para descrever em detalhe — ver
seção 5.

## 4. Contrato v2 — Response

Mantém a estrutura atual: `ProcessVideoResponse.clips: List[dict[str, Any]]`
(não tipado estritamente hoje — fora do escopo mínimo desta fase alterar isso,
mas fica registrado como melhoria recomendada para uma fase futura, já que a
diretriz deste agente é "tipagem nasce no domínio": trocar por um
`ClipResultItem(BaseModel)` com `virality_score`/`hook`/`reason` opcionais
eliminaria o `Any`).

Shape de cada item em `clips`, por origem:

| Campo | Origem automática (`ClipItem`/Gemini) | Origem manual (`ManualCut`) |
|---|---|---|
| `clip_index`, `s3_key`, `start`, `end`, `duration`, `preset` | sempre presentes | sempre presentes |
| `title` | sempre (do Gemini) | `cut.title` se informado, senão `"Manual clip {N}"` (N = índice 1-based) — **nunca ausente** |
| `hook` | sempre (do Gemini) | `None` |
| `virality_score` | sempre, 1–10 (do Gemini) | `None` |
| `reason` | sempre (do Gemini) | `None` |

O consumidor (`functions.ts:308-336`, bloco `persist-clips-and-consume`) já
trata `virality_score` nulo (`typeof clip.virality_score === "number" ? ... : null`),
então nenhuma mudança é necessária desse lado para aceitar o shape manual.

**Nota de design (ponto 7 do bug report):** `clip_pipeline.process_clip` hoje
tipa seu parâmetro como `clip_item: ClipItem | None`. A recomendação desta
especificação é mudar para `clip_item: ClipItem | ManualCut | None`, e **não**
tornar `hook`/`virality_score`/`reason` opcionais em `ClipItem` — isso
enfraqueceria o schema usado como `response_schema` do Gemini
(`core/moments.py::identify_moments`, `response_schema=MomentsExtraction`),
arriscando o LLM parar de preencher esses campos no modo automático. Em vez
disso, `ManualCut` já carrega só `start`/`end`/`title` e é passado diretamente
como `clip_item` no modo manual; a montagem do `dict` de metadata em
`process_clip` passa a ramificar por `isinstance(clip_item, ClipItem)` vs.
`isinstance(clip_item, ManualCut)` para decidir se preenche
`hook`/`virality_score`/`reason` ou os deixa `None`.

## 5. Validação de duração real do vídeo (D4 — "rejeitar corte fora da duração")

Proposta de novo módulo `core/video_probe.py`:

```python
def get_video_duration_seconds(video_path: pathlib.Path) -> float:
    """Probe the real duration (seconds) of a local video file via ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


class ManualCutExceedsVideoDurationError(ValueError):
    """Raised when any manual cut's end timestamp exceeds the real duration
    of the source video, discovered only after download/probe."""


def validate_manual_cuts_against_duration(
    manual_cuts: list["ManualCut"], video_duration_seconds: float
) -> None:
    for cut in manual_cuts:
        if cut.end > video_duration_seconds:
            raise ManualCutExceedsVideoDurationError(
                f"Manual cut end timestamp ({cut.end}s) exceeds the source "
                f"video duration ({video_duration_seconds:.2f}s)"
            )
```

Ponto de chamada em `core/video_pipeline.py::run_video_processing_pipeline`,
logo após `resolve_input_video_path` e antes de `transcriber.transcribe(...)`:

```python
video_path = resolve_input_video_path(request.s3_key, base_dir, s3_bucket=s3_bucket)

if request.mode == "manual":
    video_duration = get_video_duration_seconds(video_path)
    validate_manual_cuts_against_duration(request.manual_cuts, video_duration)
```

**Interpretação adotada (decisão de implementação deste documento, não um D
já aprovado — sinalizando explicitamente por transparência):** se **qualquer**
corte exceder a duração real, a requisição inteira é rejeitada (nenhum clipe é
processado), em vez de descartar silenciosamente só o corte inválido. Isso é
consistente com o espírito de D2 (nunca descartar entrada em silêncio) e com o
mecanismo de reembolso já existente no frontend — o `onFailure` do Inngest já
reembolsa integralmente os créditos reservados quando a chamada ao backend
falha, então rejeitar com 422 aqui não deixa o usuário sem crédito e sem
resultado.

`main.py`/`local_server.py` capturam `ManualCutExceedsVideoDurationError`
explicitamente e retornam **422** (mesmo padrão já usado para
`YouTubeVideoUnavailableError`/`YouTubeAgeRestrictedError` no endpoint
`download_youtube`), antes do `except Exception` genérico que hoje devolve 500.

## 6. Ponto único de bifurcação auto/manual

`core/video_pipeline.py::run_video_processing_pipeline` passa a receber o
`ProcessVideoRequest` inteiro (não mais `s3_key`/`preset` soltos), resolvendo o
ponto 6 do bug report — os três chamadores (`main.py`, `local_server.py`, e o
próprio pipeline) repassam o mesmo objeto, sem reimplementar a decisão
auto/manual em mais de um lugar:

```python
def run_video_processing_pipeline(
    request: ProcessVideoRequest,
    base_dir: pathlib.Path,
    transcriber: WhisperTranscriber,
    gemini_client=None,
    clips_limit: int = 5,  # só se aplica ao modo auto (D4)
    s3_bucket: str = "ai-podcast-clipper",
    asd_dir: str = "/asd",
) -> ProcessVideoResponse:
    video_path = resolve_input_video_path(request.s3_key, base_dir, s3_bucket=s3_bucket)

    if request.mode == "manual":
        video_duration = get_video_duration_seconds(video_path)
        validate_manual_cuts_against_duration(request.manual_cuts, video_duration)

    # Transcrição roda sempre (legendas dependem dela, D4)
    transcript_segments = json.loads(transcriber.transcribe(base_dir, video_path))

    if request.mode == "manual":
        clips_to_process: list = request.manual_cuts  # todos, sem clips_limit (D4)
    else:
        moments_extraction = identify_moments(transcript_segments, gemini_client=gemini_client)
        clips_to_process = moments_extraction.clips[:clips_limit]

    processed_clips = [
        process_clip(
            base_dir=base_dir,
            original_video_path=video_path,
            s3_key=request.s3_key,
            start_time=clip_item.start,
            end_time=clip_item.end,
            clip_index=index,
            transcript_segments=transcript_segments,
            preset=request.preset,
            clip_item=clip_item,
            s3_bucket=s3_bucket,
            asd_dir=asd_dir,
        )
        for index, clip_item in enumerate(clips_to_process)
    ]

    return ProcessVideoResponse(success=True, file_id=request.s3_key, clips=processed_clips)
```

`main.py` e `local_server.py` passam a chamar
`run_video_processing_pipeline(request=request, base_dir=..., transcriber=..., gemini_client=..., s3_bucket=..., asd_dir=...)`
— nada de lógica de decisão auto/manual nesses dois arquivos, que continuam só
wrappers finos (Modal vs. FastAPI local), conforme a decisão de consolidação
de pipeline já registrada (`AGENTS.md`, memória "Pipeline consolidation decision").

## 7. Regras de negócio novas (numeração para `casos-de-uso-e-regras-de-negocio.md`, seção "4. Pipeline de Processamento")

- **RN-PIPE-MANUAL-01**: O campo `mode` do contrato `POST /process_video`
  aceita exatamente dois valores: `"auto"` (default) e `"manual"`. É
  ortogonal ao conceito de layout/`clipModel` (`"auto"`/`"face_focus"`) — nenhum
  valor de layout deve jamais ser lido como modo de processamento (D6).
- **RN-PIPE-MANUAL-02**: Quando `mode == "manual"`, o campo `manual_cuts` é
  obrigatório e não pode ser vazio; requisição com `mode == "manual"` e
  `manual_cuts` ausente/vazio é rejeitada com HTTP 422, sem cair para o modo
  automático (D5) — o crédito já foi reservado no preço do modo manual.
- **RN-PIPE-MANUAL-03**: Quando `mode == "auto"`, o campo `manual_cuts` não
  deve ser enviado; se enviado (não vazio), a requisição é rejeitada com HTTP
  422. Nenhuma combinação ambígua é resolvida silenciosamente.
- **RN-PIPE-MANUAL-04**: Cada corte manual deve satisfazer `end > start` e
  `(end - start) <= 60.0` segundos — mesmo limite do modo automático
  (`ClipItem`). Este documento **supersede** o limite de 5s–180s do spec
  original (`2026-09-13-manual-cuts-timestamp-design.md`, seção 4), que nunca
  chegou a ser implementado no backend.
- **RN-PIPE-MANUAL-05**: `manual_cuts` aceita no máximo 50 itens — mesmo teto
  do schema Zod do frontend (`MAX_MANUAL_CUTS`), validado redundantemente no
  backend (mesmo padrão de defesa em profundidade de `RF-INGEST-02`).
- **RN-PIPE-MANUAL-06**: Depois do download/probe do vídeo de origem, qualquer
  corte manual cujo `end` exceda a duração real do vídeo (medida via ffprobe)
  causa rejeição de **toda** a requisição com HTTP 422. Esta validação não
  ocorre no Pydantic porque a duração real só é conhecida após o download.
- **RN-PIPE-MANUAL-07**: Cortes manuais sobrepostos entre si são permitidos;
  nenhuma validação de overlap é aplicada no modo manual (D4) — diferente do
  prompt do modo automático, que instrui o Gemini a não sobrepor clipes.
- **RN-PIPE-MANUAL-08**: No modo manual, a identificação de momentos virais
  via Gemini (`identify_moments`) é pulada; a transcrição (WhisperX) continua
  sendo executada normalmente, pois as legendas dependem dela.
- **RN-PIPE-MANUAL-09**: No modo manual, todos os cortes enviados (até o
  limite de RN-PIPE-MANUAL-05) são processados; o `clips_limit=5` do modo
  automático não se aplica.
- **RN-PIPE-MANUAL-10**: O título de um clipe gerado a partir de corte manual
  é o `title` do corte, quando informado; caso contrário, é usado um título
  padrão gerado (`"Manual clip {N}"`, N = índice 1-based) — nunca um clipe sem
  título.
- **RN-PIPE-MANUAL-11**: Clipes gerados a partir de corte manual não possuem
  `hook`, `virality_score` nem `reason` (campos `null`/ausentes na resposta);
  esses campos só são preenchidos quando a origem é o pipeline automático
  (Gemini).
- **RN-PIPE-MANUAL-12**: Os campos `aspect_ratio`, `auto_zoom` e `genre` são
  aceitos pelo contrato (não rejeitados) mas não têm efeito funcional nesta
  fase — nenhuma lógica do backend lê esses campos para alterar o
  processamento (D1). Gap conhecido, a ser endereçado por um RF futuro.
- **RN-PIPE-MANUAL-13**: Qualquer campo fora do conjunto conhecido do schema
  (`s3_key`, `preset`, `mode`, `manual_cuts`, `aspect_ratio`, `auto_zoom`,
  `genre`) faz a requisição ser rejeitada com HTTP 422
  (`model_config = ConfigDict(extra="forbid")`) — nenhum campo desconhecido é
  descartado em silêncio (D2).
- **RN-PIPE-MANUAL-14**: `mode` tem valor default `"auto"`, preservando
  compatibilidade com chamadores que não enviam esse campo — seguro mesmo com
  `extra="forbid"`, porque o default se aplica a um campo conhecido ausente,
  não a um campo desconhecido.

## 8. Dependências do lado do frontend que este contrato pressupõe (fora do escopo deste documento)

Para que o contrato v2 tenha efeito de ponta a ponta, os seguintes pontos do
frontend — já diagnosticados pelo `cto`, não reabertos aqui — precisam ser
corrigidos em paralelo (Fase 2, outro especialista):

1. `functions.ts:277` precisa parar de ler `video.clipModel` como modo de
   processamento. Por D6, `mode` deve ser **derivado** de
   `video.manualCutsJson != null` (não de `clipModel`, não de uma coluna nova).
2. `retry-project.use-case.ts:81` (`updated.clipModel === "manual"`) tem o
   mesmo bug — precisa checar `updated.manualCutsJson` em vez de `clipModel`,
   pela mesma regra D6.
3. O wire format que `functions.ts:308-336` já envia
   (`manual_cuts: event.data.manualCuts?.map((c) => ({ title: c.title, start: c.startTime, end: c.endTime }))`)
   já está compatível com `ManualCut` (campos `title`/`start`/`end`) — **nenhuma
   mudança de shape é necessária aí**, só a correção do valor de `mode`.

## 9. Erros e códigos HTTP (consolidado)

| Situação | Código | Mecanismo |
|---|---|---|
| Token Bearer inválido | 401 | já existente, inalterado |
| Campo desconhecido no payload | 422 | Pydantic (`extra="forbid"`) |
| `mode="manual"` sem `manual_cuts` / `manual_cuts` vazio | 422 | Pydantic (`model_validator`) |
| `mode="auto"` com `manual_cuts` presente | 422 | Pydantic (`model_validator`) |
| Corte com `end <= start` ou duração > 60s | 422 | Pydantic (`ManualCut.validate_duration`) |
| Mais de 50 cortes | 422 | Pydantic (`Field(max_length=...)`) |
| Corte excede duração real do vídeo | 422 | `ManualCutExceedsVideoDurationError`, capturado explicitamente em `main.py`/`local_server.py` |
| Qualquer outra falha inesperada | 500 | `except Exception` genérico, inalterado |

## 10. Casos de teste a cobrir na Fase 1 (TDD — não escritos ainda)

**Unitários — `core/schemas.py`:**
mode default `"auto"` quando omitido · campo desconhecido rejeitado (422/`ValidationError`)
· `mode="manual"` sem `manual_cuts` rejeitado · `mode="auto"` com `manual_cuts` rejeitado
· `ManualCut` com `end <= start` rejeitado · `ManualCut` com duração > 60s rejeitado
· mais de 50 cortes rejeitado · `aspect_ratio`/`auto_zoom`/`genre` aceitos sem erro (contrato, sem efeito).

**Unitários — `core/video_probe.py` (novo):**
`get_video_duration_seconds` parseia saída do ffprobe (mockar `subprocess.run`)
· `validate_manual_cuts_against_duration` levanta erro quando corte excede duração
· não levanta erro quando dentro da duração · permite cortes sobrepostos.

**Unitários — `core/video_pipeline.py`:**
modo manual não chama `identify_moments` (mock, assert não chamado) · modo
manual processa todos os cortes ignorando `clips_limit` · modo manual propaga
`ManualCutExceedsVideoDurationError` · modo automático permanece sem regressão
(teste de regressão explícito, já que a assinatura da função muda de
`s3_key`/`preset` soltos para `request`).

**Unitários — `core/clip_pipeline.py`:**
`clip_item` do tipo `ManualCut` gera `title` do corte · `ManualCut` sem
`title` cai no fallback `"Manual clip {N}"` · `clip_item` do tipo `ManualCut`
produz `hook`/`virality_score`/`reason` nulos · `clip_item` do tipo `ClipItem`
permanece sem regressão (hook/virality_score/reason preenchidos).

**Integração — `tests/test_local_server.py` (e equivalente de `main.py` se
houver harness de teste para Modal):**
payload desconhecido → 422 · `mode="manual"` sem cortes → 422 · corte
excedendo duração real do vídeo de teste → 422 · payload antigo sem `mode`
(só `s3_key`/`preset`) → 200, roda caminho automático (compatibilidade
retroativa).

**Pré-requisito a validar manualmente antes de considerar o fluxo completo
pronto (não é teste deste backend, mas condição de aceite do fluxo
ponta-a-ponta):** depois da correção de `functions.ts`/`retry-project.use-case.ts`
(seção 8), um teste de integração do frontend (`tests/integration/`) que
simula um `ProcessVideoEventData` com `mode: "manual"` e confirma que o corpo
enviado ao endpoint de processamento tem `mode: "manual"` (não `"auto"`
herdado de `clipModel`).

## 11. Impacto em documentação (para a Fase 2, não feito agora)

Quando a implementação (Fase 2) estiver concluída e testada, atualizar:
- `docs/requisitos/requisitos-funcionais-e-nao-funcionais.md:81` — `RF-PIPE-08`
  de ⚠️ para ✅, com teste(s) referenciado(s).
- `docs/requisitos/casos-de-uso-e-regras-de-negocio.md`, seção 4 — inserir as
  regras RN-PIPE-MANUAL-01..14 (hoje a linha de cortes manuais na tabela está
  incorretamente marcada ✅ — precisa ser corrigida para refletir o estado real
  antes da Fase 2).
- `docs/arquitetura/visao-fluxo-processamento-video.md` — diagrama da
  bifurcação auto/manual em `run_video_processing_pipeline`.
- `docs/operacao/checklist-go-live.md` — fechar o BLOCKER correspondente.
- `progress.md` — entrada de histórico (convenção já estabelecida).
