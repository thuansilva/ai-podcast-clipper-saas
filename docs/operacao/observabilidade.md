# Observabilidade — Lições Aprendidas / Troubleshooting

> **Status**: este documento nasceu registrando o que foi aprendido durante a
> implementação das Fases 1-3 (stack local + instrumentação Next.js +
> Inngest + stub do backend). A Fase 5 do roadmap original vai completar aqui
> a visão geral de arquitetura, o diagrama e o passo a passo de
> "como subir tudo localmente" — por enquanto, o foco é: **o que já mordemos
> e como não perder tempo mordendo de novo**.

---

## 1. O `/api/search` do Tempo tem delay de indexação — não confie nele sozinho

**O problema**: várias vezes, ao gerar um trace e consultar
`GET /api/search?q={resource.service.name="..."}` logo em seguida (mesmo
esperando 8-12 segundos), o resultado vinha vazio — dando a falsa impressão
de que a instrumentação não estava funcionando. Na real, o trace **já tinha
chegado** no Tempo; só não estava indexado pra busca ainda.

**Por quê**: o Tempo mantém os spans recentes num bloco "vivo" (in-memory,
no ingester) antes de "cortar" (cut) esse bloco e torná-lo pesquisável via
`/api/search`. Nessa config local mínima (sem persistência distribuída,
como pedido), esse ciclo de corte de bloco pode demorar bem mais do que os
poucos segundos que normalmente esperamos num teste manual.

**Como validar de forma confiável** (nessa ordem de preferência):

1. **Contadores do próprio collector** — a fonte da verdade mais rápida e
   confiável sobre "os dados saíram da aplicação e chegaram no collector":
   ```bash
   # só acessível de dentro da rede docker (não é o :8889 do Prometheus,
   # que só expõe métricas de APLICAÇÃO — é a telemetria interna do
   # próprio collector, na porta 8888)
   docker run --rm --network ai-podcast-clipper-saas_default \
     curlimages/curl:latest -s http://otel-collector:8888/metrics \
     | grep -E "receiver_accepted_spans|exporter_sent_spans|exporter_send_failed_spans|exporter_sent_log_records"
   ```
   Se `receiver_accepted_spans` sobe a cada requisição e
   `exporter_send_failed_spans` fica em 0, a instrumentação está
   funcionando — mesmo que a busca no Grafana ainda não mostre nada.

2. **Busca direta por trace ID** (`GET /api/traces/<id>`) — muito mais
   rápida de ficar consistente do que a busca por tag/service name:
   ```bash
   curl -s "http://localhost:3200/api/traces/<trace-id>"
   ```
   Se você tem o `traceId` (ex.: veio de um log correlacionado, ou você
   mesmo gerou o span e sabe o ID), prefira isso a `/api/search`.

3. **Só por último, o `/api/search`** — útil pra explorar sem saber o ID de
   antemão, mas dê tempo real a ele (na prática, esperar 15-20s foi mais
   confiável que 8-12s nos nossos testes) antes de concluir "não chegou".

---

## 2. `FastAPIInstrumentor().instrument()` (global) foi pouco confiável — prefira `instrument_app(app)`

**O problema**: `core/otel_setup.py` originalmente só chamava
`FastAPIInstrumentor().instrument()` (a variante *global*, que faz
monkeypatch em `fastapi.FastAPI.__init__` pra instrumentar qualquer app
criado depois). Isso é necessário pro **backend real no Modal**, porque o
Modal cria o `FastAPI` internamente por trás de `@modal.fastapi_endpoint` —
não existe um objeto `app` acessível pra instrumentar diretamente.

Só que, testando isso no **stub** (onde *temos* acesso direto ao `app`), a
variante global se mostrou **pouco confiável**: o processo respondia as
requisições normalmente, o `TracerProvider`/`BatchSpanProcessor` apareciam
corretamente configurados (confirmado via endpoint de debug), mas nenhum
span das rotas de negócio (`/process_video`, `/`, `/download_youtube`) saía
pro collector — só span criado manualmente (via `tracer.start_as_current_span`
explícito) funcionava.

**A correção**: no `backend-stub/main.py`, além do `setup_otel()`
(que configura o `TracerProvider`/exporter e ainda tenta o `instrument()`
global, usado pelo `main.py` real), chamamos também
`FastAPIInstrumentor.instrument_app(app)` diretamente na instância — daí
funcionou de forma consistente, confirmado repetidas vezes via contador do
collector.

**Implicação pro `main.py` real (Modal) — risco em aberto**: como não dá pra
usar `instrument_app(app)` lá (sem acesso ao objeto `app`), o backend real
segue dependendo só da variante global — a mesma que se mostrou pouco
confiável no stub antes da correção. **Isso não foi verificado em produção**
(sem acesso a deploy no Modal daqui). Se, ao fazer o deploy real, os traces
do `main.py` não aparecerem, a correção é instrumentar manualmente cada
endpoint: span explícito com `tracer.start_as_current_span(...)` +
extração de contexto do header de entrada via `propagation.extract()`,
igual ao padrão já usado nos steps do Inngest (`withSpan()` em
`src/lib/observability/tracer.ts`) — não depende de nenhum comportamento do
`FastAPIInstrumentor`.

---

## 3. `undici.fetch` importado direto não propaga `traceparent` sozinho

**O problema mais importante encontrado nesta fase.** `src/inngest/functions.ts`
faz as chamadas HTTP pro backend usando `import { fetch as undiciFetch } from
"undici"` diretamente — não o `fetch` global que o Next.js expõe. A
auto-instrumentação de fetch do `@vercel/otel` (`FetchInstrumentation`)
não injetava o header `traceparent` (W3C Trace Context) nessas chamadas.
Resultado: cada chamada ao backend abria um **trace novo e desconectado**
no lado do backend, quebrando a rastreabilidade ponta a ponta
(Next.js → Inngest → backend) que é o objetivo inteiro desta fase.

**Como descobrimos**: geramos um trace do "lado Node" com um ID conhecido,
chamamos o stub, e conferimos no Tempo que o span do stub aparecia sob um
**trace ID diferente** do gerado no Node — a prova de que a propagação não
estava acontecendo, mesmo com o stub instrumentado corretamente (item 2
acima) e a chamada funcionando (HTTP 200) normalmente.

**A correção**: injeção manual do contexto de trace nos headers antes de
cada chamada, com um helper dedicado:

```ts
// src/lib/observability/tracer.ts
import { context, propagation } from "@opentelemetry/api";

export function injectTraceHeaders(
  headers: Record<string, string>
): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}
```

Aplicado nas duas chamadas (`downloadYouTubeVideo` e o step
`call-modal-gpu`) em `src/inngest/functions.ts`:

```ts
headers: injectTraceHeaders({
  "Content-Type": "application/json",
  Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
}),
```

**Validado de ponta a ponta**: trace gerado no Node → chamada pro stub →
trace no Tempo mostra os spans do stub sob o **mesmo trace ID** gerado no
Node (`POST /process_video`, `SPAN_KIND_SERVER`, `service.name:
ai-podcast-clipper-backend-stub`).

**Regra geral pra lembrar**: qualquer código que use um cliente HTTP
importado diretamente (não o `fetch`/`http` global que o runtime
instrumenta automaticamente) — `undici`, `axios`, um SDK de terceiro que
usa seu próprio HTTP client por baixo — precisa de injeção manual de
contexto se você quer que o trace atravesse a chamada. Não assuma que
"auto-instrumentação" cobre tudo.

---

## 4. `docker compose exec` roda um processo novo — não confunda com o processo real

Detalhe bobo, mas custou um tempo de debug: `docker compose exec <serviço>
python3 -c "..."` sobe um **processo Python novo**, separado do processo
real que está servindo as requisições (PID 1 do container, iniciado pelo
`CMD` do Dockerfile). Inspecionar `trace.get_tracer_provider()` dentro de um
`exec` não diz nada sobre o estado do processo que realmente está atendendo
as requisições em produção — cada um tem seu próprio estado de módulo
Python (variáveis globais, providers configurados, etc.), mesmo rodando na
mesma imagem/container.

Pra inspecionar o processo real, ou peça pra ele mesmo expor um endpoint de
debug temporário (o que fizemos), ou meça pelo lado de fora (contadores do
collector, como no item 1).

---

## 5. Referência rápida: como consultar cada peça durante debug local

```bash
# Health dos containers
docker compose ps

# Logs de um serviço específico
docker compose logs <serviço> --tail 50

# Telemetria interna do próprio otel-collector (spans/logs recebidos e exportados)
docker run --rm --network ai-podcast-clipper-saas_default \
  curlimages/curl:latest -s http://otel-collector:8888/metrics \
  | grep -E "receiver_accepted|exporter_sent|exporter_send_failed"

# Buscar um trace específico no Tempo (rápido e confiável)
curl -s "http://localhost:3200/api/traces/<trace-id>"

# Buscar traces recentes de um serviço no Tempo (pode demorar a indexar — item 1)
curl -s "http://localhost:3200/api/search?q=%7Bresource.service.name%3D%22<nome>%22%7D&limit=5"

# Logs no Loki
curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="<nome>"}' \
  --data-urlencode "start=$(( $(date +%s) - 300 ))000000000" \
  --data-urlencode "end=$(date +%s)000000000"

# Targets que o Prometheus está raspando (ex.: confirmar que o otel-collector está "up")
curl -s http://localhost:9090/api/v1/targets
```
