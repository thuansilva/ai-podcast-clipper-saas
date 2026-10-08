# Evidências Completas do Experimento de Observabilidade (para o artigo)

> Arquivo de uso pessoal — **não versionado no git**, feito só para você copiar
> e colar numa conversa do Claude e escrever o artigo. Reúne tudo que
> levantamos: pergunta de pesquisa, metodologia, dados brutos, evidências de
> terminal/log de cada execução, descrição dos dashboards, e a análise final
> (incluindo a limitação que invalida a conclusão simplista).

---

## 1. Pergunta de pesquisa / hipótese

**Hipótese testada:** uma stack de observabilidade (OpenTelemetry +
Prometheus + Grafana Alerting + Tempo) reduz o MTTD (*mean time to detect*)
de falhas de produção, comparado a uma equipe que investiga só com
terminal/`curl`/logs, sem dashboards nem alertas.

### Objetivo geral
Avaliar o impacto de uma stack de observabilidade no tempo de detecção de
falhas (MTTD) em uma aplicação real de processamento de vídeo, comparando-o
ao cenário de detecção manual (sem observabilidade).

### Objetivos específicos
1. Instrumentar a aplicação (frontend Next.js + backend de processamento de
   vídeo) com métricas RED (Rate, Errors, Duration) e tracing distribuído,
   construindo dashboards e regras de alerta no Grafana.
2. Definir e automatizar 3 cenários de falha repetíveis e representativos do
   domínio do produto.
3. Medir o MTTD de cada cenário no grupo **`com_observabilidade`** (detecção
   via Grafana Alerting), registrando também se o trace correspondente é
   localizável no Tempo.
4. Medir o MTTD dos mesmos cenários no grupo **`baseline`** (detecção
   manual, sem dashboards/alertas/tracing).
5. Comparar quantitativamente o MTTD entre os dois grupos, por tipo de
   falha, para concluir se — e em qual magnitude — a observabilidade reduz o
   tempo de detecção.

---

## 2. Metodologia

### 2.1 Stack e ambiente
Stack local via Docker Compose: `otel-collector`, `prometheus`, `tempo`,
`loki`, `grafana`, `backend-stub` (simula o backend de processamento de
vídeo), `blackbox-exporter` (probe HTTP de disponibilidade), `node-exporter`,
`cadvisor`, `postgres`. Frontend Next.js instrumentado com OpenTelemetry.

### 2.2 Cenários de falha

| Cenário | O que simula | Como é injetado |
|---|---|---|
| `backend_indisponivel` | Backend de processamento de vídeo cai | `docker stop` no container do backend-stub |
| `latencia_alta` | Backend continua no ar, mas responde muito mais lento, sem gerar erro | Recria o backend-stub com `STUB_LATENCY_MS_MIN/MAX` elevado para 4000–6000ms (range normal: 200–1500ms) |
| `falha_webhook_stripe` | Falha de infraestrutura (Postgres indisponível) afetando um fluxo crítico de billing | `docker stop` no Postgres + disparo de um webhook Stripe assinado localmente (modo teste) |

### 2.3 Grupo `com_observabilidade`
Medido via `scripts/experimento-observabilidade.sh`: injeta a falha, faz
polling até a regra de alerta do Grafana entrar em **Firing**, reverte,
espera voltar a **Normal**, grava T0/T1/MTTD/trace/T2.

### 2.4 Grupo `baseline`
Medido manualmente, seguindo `docs/pesquisa/experimento-observabilidade/roteiro-baseline.md`
— sem abrir Grafana/Prometheus/Tempo em nenhum momento. Para cada cenário:
T0 = timestamp impresso ao injetar a falha; T1 = timestamp da primeira
observação manual (via `curl`/`watch`/log) que revela o problema; T2 =
timestamp de confirmação da volta ao normal.

### 2.5 Dashboards usados no grupo `com_observabilidade`
Documentados painel a painel em `guia-dashboards-grafana.md` (queries
confirmadas lendo o JSON real de cada dashboard via API do Grafana):

- **Backend Stub — RED** (customizado): rate por rota, taxa de erro,
  latência p95/p99 por rota, disponibilidade via probe HTTP
  (`blackbox-exporter`). Dashboard usado para detectar os 3 cenários.
  - Request rate: `sum by (service_name, http_route) (rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub"}[$__rate_interval]))`
  - Taxa de erro: razão entre `rate(...status_code="STATUS_CODE_ERROR"...)` e `rate(...)` total
  - Latência p95/p99: `histogram_quantile(0.95|0.99, sum by (le, ...) (rate(traces_spanmetrics_duration_milliseconds_bucket{...}[$__rate_interval])))`
  - Disponibilidade: `probe_success{job="blackbox-backend-stub"}` (1=UP, 0=DOWN)
  - Regra de alerta "Backend stub indisponível (probe HTTP)": `for: 1m` após `probe_success` virar 0
  - Regra de alerta "Latência alta no backend-stub (p95)": limiar 2000ms sustentado
  - Regra de alerta "Taxa de erro alta no backend-stub (5xx)": limiar ~20% sustentado
- **Node Exporter Full** (dashboard oficial, ID 1860): métricas de host
  (CPU, memória, disco, rede, load average). Não mostrou mudança perceptível
  em nenhum cenário (o backend-stub é leve: ~0,2% CPU, ~107MB, frente ao
  host inteiro).
- **cAdvisor** (dashboard oficial, ID 21743): métricas por container Docker
  (CPU, memória, I/O, rede, "Container Restarts"). A série de um container
  parado some do gráfico (não zera visualmente).

---

## 3. Dados brutos (CSV completo)

```csv
cenario,grupo,timestamp_T0,timestamp_T1_alerta,mttd_segundos,trace_encontrado,timestamp_T2_resolvido
backend_indisponivel,com_observabilidade,2026-09-30T04:28:09Z,2026-09-30T04:29:31Z,82,nao,2026-09-30T04:30:32Z
latencia_alta,com_observabilidade,2026-09-30T04:40:36Z,2026-09-30T04:43:36Z,180,nao,2026-09-30T04:49:37Z
falha_webhook_stripe,com_observabilidade,2026-09-30T05:07:22Z,2026-09-30T05:10:11Z,169,sim,2026-09-30T05:15:41Z
backend_indisponivel,baseline,2026-10-07T07:03:07Z,2026-10-07T07:03:33Z,26,n/a,2026-10-07T07:04:04Z
latencia_alta,baseline,2026-10-07T07:07:08Z,2026-10-07T07:08:37Z,89,n/a,2026-10-07T07:11:20Z
falha_webhook_stripe,baseline,2026-10-07T07:18:33Z,2026-10-07T07:18:53Z,20,n/a,2026-10-07T07:22:56Z
```

### Tabela comparativa final

| Cenário | MTTD `com_observabilidade` | MTTD `baseline` | Diferença |
|---|---|---|---|
| `backend_indisponivel` | 82s | 26s | baseline 56s mais rápido |
| `latencia_alta` | 180s | 89s | baseline 91s mais rápido |
| `falha_webhook_stripe` | 169s | 20s | baseline 149s mais rápido |

---

## 4. Evidência detalhada por cenário

### 4.1 `backend_indisponivel` — `com_observabilidade` (2026-09-30)
- T0 = `2026-09-30T04:28:09Z` (container parado)
- T1 = `2026-09-30T04:29:31Z` (regra "Backend stub indisponível (probe HTTP)" entrou em Firing) → **MTTD 82s**
- T2 = `2026-09-30T04:30:32Z` (voltou a Normal)
- Transição da regra: Normal → Pending (após `probe_success=0`, aguardando `for: 1m`) → Firing.
- Painel "Request rate": não cai em degrau, desce suavemente em 1–2min (janela de cálculo).
- cAdvisor: série do container some dos painéis de CPU/memória (não zera).
- Node Exporter Full: nenhuma mudança perceptível.
- Reversão: ~61s de Firing até voltar a Normal.

### 4.2 `backend_indisponivel` — `baseline` (2026-10-07, medição real do usuário)
Comandos executados e saída real:
```
$ date -u +%Y-%m-%dT%H:%M:%SZ && docker stop ai-podcast-backend-stub
2026-10-07T07:03:07Z
ai-podcast-backend-stub
```
```
$ watch -n 2 'date -u +%Y-%m-%dT%H:%M:%SZ; curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8001/'
2026-10-07T07:03:33Z
HTTP 000
```
```
$ docker start ai-podcast-backend-stub
ai-podcast-backend-stub
```
```
$ until curl -sf -o /dev/null http://localhost:8001/; do sleep 1; done; date -u +%Y-%m-%dT%H:%M:%SZ
2026-10-07T07:04:04Z
```
- T0 = `2026-10-07T07:03:07Z`, T1 = `2026-10-07T07:03:33Z` → **MTTD 26s**, T2 = `2026-10-07T07:04:04Z`.
- Observação: a falha de conexão já apareceu na primeira iteração visível do `watch` após o `docker stop`.

### 4.3 `latencia_alta` — `com_observabilidade` (2026-09-30)
- T0 = `2026-09-30T04:40:36Z`, T1 = `2026-09-30T04:43:36Z` → **MTTD 180s** (o maior dos 3 cenários), T2 = `2026-09-30T04:49:37Z`.
- Motivo do MTTD alto: regra de latência usa `rate(...[5m])` — tanto para detectar quanto para confirmar a volta ao normal, precisa de uma janela de 5min "esvaziar" os valores ruins/bons.

### 4.4 `latencia_alta` — `baseline` (2026-10-07, medição real do usuário)
```
$ date -u +%Y-%m-%dT%H:%M:%SZ && STUB_LATENCY_MS_MIN=4000 STUB_LATENCY_MS_MAX=6000 docker compose up -d --force-recreate backend-stub
2026-10-07T07:07:08Z
[+] Running 4/4
 ✔ Container ai-podcast-loki            Running   0.0s
 ✔ Container ai-podcast-tempo           Running   0.0s
 ✔ Container ai-podcast-otel-collector  Running   0.0s
 ✔ Container ai-podcast-backend-stub    Started   0.6s
```
```
$ date -u +%Y-%m-%dT%H:%M:%SZ && curl -s -o /dev/null -w "tempo de resposta: %{time_total}s\n" -X POST http://localhost:8001/process_video -H "Content-Type: application/json" --data-raw '{"s3_key":"experimento-observabilidade/latencia.mp4"}'
2026-10-07T07:08:37Z
tempo de resposta: 4.526198s
```
(chamadas seguintes confirmaram latência sustentada: 6.00s, 5.14s, 5.96s, 5.27s)

Reversão e confirmação:
```
2026-10-07T07:10:53Z  tempo de resposta: 0.354914s
2026-10-07T07:10:57Z  tempo de resposta: 1.047778s
2026-10-07T07:11:20Z  (date -u — T2, após 2 chamadas seguidas < 1.5s)
```
- T0 = `2026-10-07T07:07:08Z`, T1 = `2026-10-07T07:08:37Z` → **MTTD 89s**, T2 = `2026-10-07T07:11:20Z`.
- Observação: a primeira chamada manual (feita ~1min30s após a injeção) já veio com 4,5s — ou seja, detectada na primeira tentativa.

### 4.5 `falha_webhook_stripe` — `com_observabilidade` (2026-09-30)
- T0 = `2026-09-30T05:07:22Z`, T1 = `2026-09-30T05:10:11Z` → **MTTD 169s**, T2 = `2026-09-30T05:15:41Z`.
- Único cenário em que o **trace foi encontrado no Tempo** — é o único que gera uma requisição HTTP completa de ponta a ponta (webhook → tentativa de persistência no Postgres) no momento da falha.

### 4.6 `falha_webhook_stripe` — `baseline` (2026-10-07, medição real do usuário)
Payload assinado localmente (modo teste confirmado):
```
$ SIGN_RESP=$(curl -sf -X POST http://localhost:3000/api/dev-sign-stripe-payload --data-raw "$BODY")
{"header":"t=1791357270,v1=3eba8a27306a0c3b6280b8f90b8d731e81a8c3c13135899e74fb63be4c1276bc","stripeSecretKeyMode":"test"}
```
Injeção da falha:
```
$ date -u +%Y-%m-%dT%H:%M:%SZ && docker stop ai-podcast-postgres
2026-10-07T07:18:33Z
ai-podcast-postgres
```
Detecção (primeira tentativa já deu erro):
```
$ date -u +%Y-%m-%dT%H:%M:%SZ && curl ... /api/webhooks/stripe ...
2026-10-07T07:18:53Z
HTTP 500
```
Confirmado também pelo log do `npm run dev` (evidência independente, mesmo timestamp):
```
prisma:error Error in PostgreSQL connection: Error { kind: Db, cause: Some(DbError {
  severity: "FATAL", code: SqlState(E57P01),
  message: "terminating connection due to administrator command", ... }) }
PrismaClientKnownRequestError: Can't reach database server at `localhost:5432`
  at PrismaProcessedEventRepository.isProcessed (.../ProcessedEventRepository...)
  at handleStripeEvent (...)
{"timestamp":"2026-10-07T07:18:53.630Z","level":"error","message":"Error processing Stripe webhook", ...}
 POST /api/webhooks/stripe 500 in 264ms
```
(erro se repetiu de forma consistente nas tentativas seguintes, `07:18:55Z` e `07:18:58Z`, todas `500`)

Reversão:
```
$ docker start ai-podcast-postgres
$ sleep 5
```
Nota metodológica capturada durante a execução: ao tentar confirmar o T2
reusando o mesmo `$HEADER` assinado no início, as tentativas vieram `HTTP
400` (não `200`) porque a assinatura do webhook Stripe tem tolerância padrão
de 5 minutos (`stripe.webhooks.constructEvent`, em
`ai-podcast-clipper-frontend/src/app/api/webhooks/stripe/route.ts:35`) e esse
tempo já tinha passado. Resolvido re-assinando o payload antes do disparo
final — isso não afeta o T1 já capturado (que ocorreu bem dentro da janela
de 5min), só adiou a confirmação do T2:
```
$ SIGN_RESP=$(curl -sf -X POST http://localhost:3000/api/dev-sign-stripe-payload --data-raw "$BODY")
$ HEADER=$(echo "$SIGN_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['header'])")
$ date -u +%Y-%m-%dT%H:%M:%SZ && curl ... /api/webhooks/stripe ...
2026-10-07T07:22:56Z
HTTP 200
```
- T0 = `2026-10-07T07:18:33Z`, T1 = `2026-10-07T07:18:53Z` → **MTTD 20s**, T2 = `2026-10-07T07:22:56Z`.

---

## 5. Análise: por que o baseline "venceu" nos 3 cenários

Isso **não significa que observabilidade seja pior que detecção manual** em
produção. O resultado reflete uma particularidade do desenho do experimento:

1. **As regras de alerta têm atraso proposital, por design.** `for: 1m`
   (disponibilidade) e janelas `rate(...[5m])` (erro/latência) existem para
   evitar falsos positivos em picos momentâneos — é uma escolha de
   engenharia (trade-off ruído vs. velocidade), não uma limitação da
   observabilidade em si.
2. **O baseline, aqui, não simulou "alguém que não sabia que algo ia
   quebrar".** Em todos os 3 cenários, o pesquisador injetou a falha e já
   sabia exatamente quando ela começou, testando ativamente logo em seguida
   — a primeira tentativa manual, em todos os casos, já detectou o
   problema. Isso é bem diferente do cenário real que o experimento queria
   simular: uma equipe que não está olhando para nada, e só percebe o
   problema quando um usuário reclama, ou por acaso, ou numa verificação de
   rotina. O verdadeiro "custo" da falta de observabilidade em produção não
   é o tempo entre a falha e a primeira checagem manual *imediata* — é o
   tempo entre a falha e a **próxima vez que alguém, por acaso ou rotina,
   decide checar** aquele sistema. Esse tempo não foi medido aqui.
3. **O que este experimento prova de fato é mais restrito:** para os 3
   cenários testados, um alerta automático com janela de agregação de 1–5
   minutos é mais lento para disparar do que uma pessoa testando
   manualmente no instante exato da falha. Isso é esperado e não é
   surpreendente — não prova nada sobre o valor da observabilidade quando
   ninguém está testando manualmente, que é o cenário que ela resolve na
   prática.

### O que já está comprovado
- É possível instrumentar a aplicação com métricas RED + tracing e obter
  detecção automática via Grafana Alerting para os 3 cenários definidos.
- Os MTTDs medidos com observabilidade variam de 82s a 180s, dependendo do
  tipo de falha — falhas "silenciosas" (latência alta, sem erro) levam mais
  tempo para disparar alerta do que falhas "binárias" (serviço fora do ar).
- Tracing distribuído (Tempo) só se mostrou útil, neste experimento, para
  investigar a causa raiz de uma falha que já gera uma requisição completa
  (o webhook do Stripe); para indisponibilidade total ou ausência de
  tráfego, não há trace a ser buscado.
- O MTTD baseline medido (20–89s) é o tempo de detecção de alguém testando
  ativamente logo após a falha — não o tempo de detecção de uma equipe real
  sem observabilidade, que só perceberia por acaso ou via reclamação de
  usuário.

### O que ainda não está provado (gap para o artigo)
- A hipótese real de interesse — "sem observabilidade, quanto tempo uma
  equipe leva pra notar uma falha que não está ativamente procurando?" — não
  foi testada. Exigiria um desenho diferente (ex.: intervalo de checagem de
  rotina realista, ou tempo até reclamação de usuário simulada).
- Os limiares das regras de alerta (`for: 1m`, janelas de 5min) não foram
  comparados com nenhum SLO/SLA real do produto — não dá pra afirmar se
  82–180s é "rápido" ou "lento" o suficiente sem esse contexto.

---

## 6. Possível próximo passo (se quiser fortalecer o artigo)
Redesenhar a medição do `baseline` para simular ausência real de
vigilância — por exemplo, definindo um intervalo de checagem de rotina
(ex.: "a cada 30min alguém olha o sistema") e medindo o MTTD a partir daí,
em vez de medir o tempo de reação de alguém que acabou de injetar a própria
falha.
