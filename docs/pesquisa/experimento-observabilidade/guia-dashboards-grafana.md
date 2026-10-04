# Guia dos dashboards do Grafana — experimento de observabilidade

Este documento explica, painel por painel, o que já está montado no Grafana
local (`http://localhost:3001`, login anônimo como Admin — não precisa criar
usuário nem senha) e propõe duas simulações para você ver os gráficos
mudando com os próprios olhos.

Todas as queries abaixo foram confirmadas lendo o JSON real de cada
dashboard via API do Grafana (`GET /api/dashboards/uid/<uid>`), não de
memória. Nenhum painel ou query aqui foi inventado.

Convenções usadas neste guia:
- **PromQL** é a linguagem de consulta do Prometheus. Você não precisa saber
  escrever PromQL para usar os dashboards — só estamos "traduzindo" a query
  de cada painel para você começar a reconhecer os padrões com o tempo.
- "Normal/ocioso" = valores medidos com a stack rodando sem nenhuma
  simulação de falha ativa, em 2026-09-30.

---

## Parte 1 — O que tem em cada dashboard

### 1. Backend Stub — RED (rate/errors/duration)

- UID: `backend-stub-red`
- URL direta: `http://localhost:3001/d/backend-stub-red`
- Pasta: "Observability"
- Atualiza automaticamente a cada **10 segundos**; janela de tempo padrão:
  últimos 15 minutos.

Este é o dashboard **customizado para este projeto**, feito especificamente
para olhar a saúde do `backend-stub` (o container que simula o
processamento de vídeo) sob a ótica "RED" — **R**ate (taxa de requisições),
**E**rrors (taxa de erro) e **D**uration (duração/latência). Tem 4 painéis,
todos relevantes.

#### Painel 1 — "Request rate (por rota)"

- **O que mostra**: quantas requisições por segundo o `backend-stub` está
  recebendo, separadas por rota (`/`, `/process_video`, `/download_youtube`).
- **Query**:
  ```promql
  sum by (service_name, http_route) (
    rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub"}[$__rate_interval])
  )
  ```
  Tradução simples: "conta quantas chamadas por segundo chegaram no
  backend-stub, nos últimos minutos, e agrupa o resultado por rota".
- **Normal/ocioso**: praticamente **zero** nas rotas de aplicação
  (`/process_video`, `/download_youtube`) — só aparece uma linha bem baixa
  na rota `/`, porque o `blackbox-exporter` faz um "ping" HTTP nessa rota a
  cada 15 segundos (isso não é tráfego de uso real, é o probe de
  disponibilidade).
- **Indica problema**: uma queda abrupta para zero em TODAS as rotas (sem
  nem o probe aparecer) é sinal de que o processo caiu — compare com o
  painel "Disponibilidade" abaixo. Um pico muito alto e sustentado pode
  indicar um laço de retry de algum cliente.

#### Painel 2 — "Taxa de erro (%)"

- **O que mostra**: de todas as chamadas que o backend-stub recebeu, qual
  percentual terminou em erro (resposta 5xx).
- **Query**:
  ```promql
  sum by (service_name) (
    rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub", status_code="STATUS_CODE_ERROR"}[$__rate_interval])
  )
  /
  sum by (service_name) (
    rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub"}[$__rate_interval])
  )
  ```
  Tradução simples: "divide o número de chamadas com erro pelo número total
  de chamadas, nos últimos minutos — dá a fração de pedidos que falharam".
- **Normal/ocioso**: geralmente aparece **sem dados** ("No data"), porque com
  zero (ou quase zero) chamadas reais, a divisão 0/0 não produz um número.
  Isso é esperado e não é um bug do painel.
- **Indica problema**: qualquer valor sustentado acima de ~20% (o limiar
  usado pelo alerta "Taxa de erro alta no backend-stub (5xx)") é motivo de
  atenção. O stub tem uma taxa de erro configurável via `STUB_ERROR_RATE`
  (0 por padrão).

#### Painel 3 — "Latência p95 / p99 (ms, por rota)"

- **O que mostra**: quanto tempo as requisições estão demorando para
  responder — especificamente os percentis 95 e 99 (ou seja, "95% das
  chamadas são mais rápidas que isso" e "99% são mais rápidas que isso"),
  por rota, em milissegundos.
- **Queries** (duas linhas no mesmo painel):
  ```promql
  histogram_quantile(0.95, sum by (le, service_name, http_route) (
    rate(traces_spanmetrics_duration_milliseconds_bucket{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub"}[$__rate_interval])
  ))
  ```
  ```promql
  histogram_quantile(0.99, sum by (le, service_name, http_route) (
    rate(traces_spanmetrics_duration_milliseconds_bucket{span_kind="SPAN_KIND_SERVER", service_name="ai-podcast-clipper-backend-stub"}[$__rate_interval])
  ))
  ```
  Tradução simples: "calcula o percentil 95 (depois o 99) do tempo de
  resposta, com base no histograma de duração das chamadas, por rota".
- **Normal/ocioso**: hoje fica bem baixo (poucos milissegundos — medido em
  ~9,5 ms), porque o único tráfego ocioso é o probe na rota `/`, que
  responde instantaneamente (não passa pela latência simulada). Quando você
  chamar `/process_video` de verdade, o esperado é a latência subir para a
  faixa configurada em `STUB_LATENCY_MS_MIN`/`STUB_LATENCY_MS_MAX` no
  `docker-compose.yml` (200–1500 ms por padrão).
- **Indica problema**: p95/p99 sustentado acima de 2000 ms é o limiar do
  alerta "Latência alta no backend-stub (p95)".

#### Painel 4 — "Disponibilidade (probe HTTP via blackbox-exporter)"

- **O que mostra**: se o backend-stub respondeu com sucesso (2xx) na última
  verificação HTTP externa. É um stat simples que mostra o texto **"UP"**
  (verde) ou **"DOWN"** (vermelho).
- **Query**:
  ```promql
  probe_success{job="blackbox-backend-stub"}
  ```
  Tradução simples: "pega o resultado (1 = sucesso, 0 = falha) do último
  teste HTTP feito pelo blackbox-exporter contra o backend-stub".
- **Normal/ocioso**: **"UP"** / `1` / verde.
- **Indica problema**: **"DOWN"** / `0` / vermelho — o container está parado,
  travado ou inacessível pela rede. Esse é o sinal usado pelo alerta
  "Backend stub indisponível (probe HTTP)".

---

### 2. Node Exporter Full

- UID: `rYdddlPWk`
- URL direta: `http://localhost:3001/d/rYdddlPWk`
- Dashboard **oficial** da comunidade Grafana (ID 1860), extenso — tem 16
  seções ("rows") cobrindo praticamente toda métrica que o `node_exporter`
  expõe sobre a máquina host (systemd, timesync, hardware, sockets de rede
  por protocolo, etc.).
- Atualiza automaticamente a cada **1 minuto**; janela de tempo padrão:
  últimas 24 horas (para ver uma simulação de poucos minutos, troque para
  "Last 15 minutes" no canto superior direito, senão a mudança fica
  pequena/apertada num gráfico de 24h).
- **Este guia não documenta o dashboard inteiro** — abaixo estão os 10
  painéis mais relevantes para este projeto (CPU, memória, disco, rede,
  load average). O resto do dashboard (rows "Memory Meminfo", "Memory
  Vmstat", "System Timesync", "System Processes", "System Misc", "Hardware
  Misc", "Systemd", "Storage Disk/Filesystem" detalhado, "Network
  Sockstat/Netstat", "Node Exporter") cobre métricas de host bem mais
  granulares, que não são o foco do experimento agora — pode explorar depois
  por curiosidade, mas não é necessário para este guia.

Os 10 painéis abaixo estão na primeira row, "Quick CPU / Mem / Disk" (os 5
primeiros) e na segunda row, "Basic CPU / Mem / Net / Disk" (os 4
seguintes), que já ficam visíveis assim que o dashboard abre, sem precisar
expandir nada — mais o painel "Uptime", também na primeira row.

#### "CPU Busy" (gauge)

- **O que mostra**: percentual médio de uso de CPU da máquina, somando todos
  os núcleos.
- **Query**: `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle",instance="$node",job="$job"}[$__rate_interval])))`
  — Tradução: "100% menos a fração de tempo que a CPU passou ociosa".
- **Normal/ocioso**: baixo, medido em **~3%** com a stack local rodando sem
  carga adicional.
- **Indica problema**: valores sustentados acima de ~80-90% indicam a
  máquina sob pressão de CPU.

#### "Sys Load" (gauge)

- **O que mostra**: a "load average" de 1 minuto do Linux, normalizada pelo
  número de núcleos (ou seja, 100% = carga igual ao número de núcleos
  disponíveis).
- **Query**: `scalar(node_load1{instance="$node",job="$job"}) * 100 / count(count(node_cpu_seconds_total{instance="$node",job="$job"}) by (cpu))`
  — Tradução: "load average de 1 minuto dividido pelo número de núcleos,
  em percentual".
- **Normal/ocioso**: medido em **~2%** (load bem baixa em relação ao número
  de núcleos da máquina).
- **Indica problema**: valores sustentados próximos ou acima de 100%
  significam que há mais processos querendo CPU do que núcleos disponíveis.

#### "RAM Used" (gauge)

- **O que mostra**: percentual de memória RAM realmente em uso (excluindo
  cache/buffers que o Linux pode liberar a qualquer momento).
- **Query**: `clamp_min((1 - (node_memory_MemAvailable_bytes{instance="$node", job="$job"} / node_memory_MemTotal_bytes{instance="$node", job="$job"})) * 100, 0)`
  — Tradução: "100% menos a fração de memória disponível, limitado a não
  ficar negativo".
- **Normal/ocioso**: medido em **~42%**.
- **Indica problema**: valores sustentados acima de ~90% são sinal de
  pressão de memória (risco de OOM / swap).

#### "SWAP Used" (gauge)

- **O que mostra**: percentual de memória swap em uso.
- **Query**: `(node_memory_SwapTotal_bytes{...} > bool 0) * ((node_memory_SwapTotal_bytes{...} - node_memory_SwapFree_bytes{...}) / node_memory_SwapTotal_bytes{...}) * 100`
  — Tradução: "quanto da swap configurada já está ocupado, em percentual (0
  se não houver swap configurada)".
- **Normal/ocioso**: medido em **~0,002%** — praticamente zero.
- **Indica problema**: swap subindo de forma sustentada é sinal de que a
  RAM está estourando e o sistema está "descarregando" memória para o disco
  (deixa tudo mais lento).

#### "Root FS Used" (gauge)

- **O que mostra**: percentual do disco raiz (`/`) já ocupado.
- **Query**: `((node_filesystem_size_bytes{instance="$node", job="$job", mountpoint="/", fstype!="rootfs"} - node_filesystem_avail_bytes{...}) / node_filesystem_size_bytes{...}) * 100`
  — Tradução: "espaço usado dividido pelo espaço total do disco raiz".
- **Normal/ocioso**: medido em **~15%**.
- **Indica problema**: acima de ~85-90% é hora de liberar espaço (ex.:
  volumes Docker antigos, imagens não usadas).

#### "CPU Basic" (timeseries)

- **O que mostra**: evolução no tempo do uso de CPU, separado por tipo de
  atividade (sistema, usuário, I/O wait, interrupções, ociosa).
- **Queries** (6 linhas): `avg(rate(node_cpu_seconds_total{..., mode="system"}[$__rate_interval]))` (Busy System), idem para `mode="user"` (Busy User), `mode="iowait"` (Busy Iowait), soma dos modos de IRQ (Busy IRQs), soma dos modos restantes (Busy Other), e `mode="idle"` (Idle).
  — Tradução: "fração de tempo que a CPU passou em cada tipo de atividade,
  por segundo".
- **Normal/ocioso**: linha "Idle" dominando perto do topo (~95-98%), as
  demais bem próximas de zero.
- **Indica problema**: "Busy System"/"Busy User" subindo e "Idle" descendo
  de forma sustentada = máquina ficando ocupada; "Busy Iowait" alto
  especificamente indica que processos estão esperando o disco.

#### "Memory Basic" (timeseries)

- **O que mostra**: uso de memória RAM e swap ao longo do tempo, separado em
  Total, Used (realmente em uso), Cache+Buffer (recuperável), Free (livre) e
  Swap used.
- **Queries** (5 linhas): `node_memory_MemTotal_bytes` (Total); `MemTotal - MemFree - (Cached+Buffers+SReclaimable)` (Used); `Cached+Buffers+SReclaimable` (Cache + Buffer); `node_memory_MemFree_bytes` (Free); `SwapTotal - SwapFree` (Swap used).
  — Tradução: "quanto de RAM está realmente ocupado, quanto é cache que pode
  ser liberado, e quanto está livre".
- **Normal/ocioso**: linha "Used" estável, bem abaixo da linha "Total";
  "Swap used" perto de zero.
- **Indica problema**: "Used" subindo continuamente até se aproximar de
  "Total", ou "Swap used" saindo de zero e crescendo.

#### "Network Traffic Basic" (timeseries)

- **O que mostra**: tráfego de rede recebido (Rx) e enviado (Tx) por
  interface, em bits por segundo.
- **Queries**: `rate(node_network_receive_bytes_total{...}[$__rate_interval])*8` (Rx {{device}}); `rate(node_network_transmit_bytes_total{...}[$__rate_interval])*8` (Tx {{device}}).
  — Tradução: "quantos bits por segundo entraram/saíram em cada interface de
  rede, nos últimos instantes".
- **Normal/ocioso**: baixo e com pequenos picos (tráfego local entre os
  containers da stack).
- **Indica problema**: picos muito altos e sustentados podem indicar
  transferência de dados fora do esperado (ex.: download grande, tráfego
  anômalo).

#### "Disk Space Used Basic" (timeseries)

- **O que mostra**: percentual de uso de cada sistema de arquivos montado
  (um por "mountpoint"), ao longo do tempo.
- **Query**: `((node_filesystem_size_bytes{..., device!~'rootfs'} - node_filesystem_avail_bytes{...}) / node_filesystem_size_bytes{...}) * 100` com legenda `{{mountpoint}}`.
  — Tradução: "percentual ocupado de cada partição/volume montado".
- **Normal/ocioso**: linhas estáveis e baixas (consistente com o "Root FS
  Used" de ~15%).
- **Indica problema**: qualquer linha subindo continuamente em direção a
  100%.

#### "Uptime" (stat)

- **O que mostra**: há quanto tempo a máquina está no ar sem reiniciar.
- **Query**: `node_time_seconds{instance="$node",job="$job"} - node_boot_time_seconds{instance="$node",job="$job"}`
  — Tradução: "hora atual menos a hora em que o sistema ligou".
- **Normal/ocioso**: um número crescente (em segundos, convertido pelo
  Grafana para um formato legível como "Xd Yh").
- **Indica problema**: esse painel "zerar" inesperadamente (voltar a um
  valor muito baixo) indica que a máquina/VM reiniciou.

> Nota sobre a variável de template no topo do dashboard ("job" / "node" /
> "instance"): como só existe um `node_exporter` rodando nesta stack
> (`node-exporter:9100`, ver `docker-compose.yml`), o valor padrão já deve
> vir selecionado corretamente. Se algum painel aparecer vazio, confira se
> esses dropdowns não ficaram sem seleção.

---

### 3. cAdvisor exporter - Docker containers Overview

- UID: `ae3c41d7-cea5-4cca-a918-5708706b4d1a`
- URL direta: `http://localhost:3001/d/ae3c41d7-cea5-4cca-a918-5708706b4d1a`
- Dashboard **oficial** da comunidade Grafana (ID 21743), olha recursos
  **por container Docker** (diferente do Node Exporter Full, que olha a
  máquina como um todo).
- Atualiza automaticamente a cada **5 segundos**; janela de tempo padrão:
  últimos 5 minutos — o mais "ao vivo" dos três dashboards.
- Tem 2 dropdowns no topo, "Docker Host" e "Container Name", ambos com
  "All" (todos) selecionado por padrão — se algum painel aparecer vazio,
  confira se não ficaram filtrados para um host/container específico sem
  querer.
- Tem 6 seções ("rows"): Host Overview, CPU, Memory, I/O, Network, Details —
  todas com painéis relevantes, nenhuma foi omitida neste guia (o dashboard
  é pequeno, 10 painéis no total).

#### "Core usage" (row: Host Overview)

- **O que mostra**: soma do uso de CPU de **todos** os containers juntos
  (em núcleos, ex.: 0.5 = meio núcleo).
- **Query**: `sum(rate(container_cpu_usage_seconds_total{instance=~"$docker_host",name=~".+"}[$__rate_interval])) by(instance)`
  — Tradução: "soma a taxa de uso de CPU de todos os containers, por host".
- **Normal/ocioso**: medido em **~0,08 núcleos** (bem abaixo de 1 núcleo
  inteiro).
- **Indica problema**: subida sustentada e grande indica algum container
  consumindo CPU bem mais que o normal.

#### "Total Memory Usage by Host" (row: Host Overview)

- **O que mostra**: soma da memória usada por todos os containers.
- **Query**: `sum(container_memory_usage_bytes{instance=~"$docker_host",name=~".+"}) by (instance)`
  — Tradução: "soma a memória usada de todos os containers, por host".
- **Normal/ocioso**: medido em **~1,3 GB** no total (toda a stack local:
  Postgres, OTel Collector, Prometheus, Loki, Tempo, Grafana, backend-stub,
  blackbox-exporter, node-exporter, cadvisor).
- **Indica problema**: crescimento contínuo sem estabilizar (vazamento de
  memória em algum serviço).

#### "CPU Usage (% by Core)" (row: CPU)

- **O que mostra**: uso de CPU por container individual, em percentual de
  um núcleo (100% = um núcleo inteiro ocupado só por aquele container).
- **Query**: `sum(rate(container_cpu_usage_seconds_total{instance=~"$docker_host",name=~".+"}[$__rate_interval])) by (name) * 100`
  — Tradução: "taxa de uso de CPU de cada container, em percentual de um
  núcleo".
- **Normal/ocioso**: `ai-podcast-backend-stub` medido em **~0,2%**; o mais
  alto ocioso costuma ser o `ai-podcast-cadvisor` (ele mesmo lendo métricas
  de todos os outros), em torno de **~4-5%**.
- **Indica problema**: algum container específico subindo muito e
  continuamente (ex.: um loop infinito).

#### "Memory Usage" (row: Memory)

- **O que mostra**: memória usada por container individual, em bytes.
- **Query**: `sum(container_memory_usage_bytes{instance=~"$docker_host",name=~"$container_name",name=~".+"}) by (name)`
  — Tradução: "memória usada por cada container, individualmente".
- **Normal/ocioso**: `ai-podcast-backend-stub` medido em **~107 MB**.
- **Indica problema**: crescimento contínuo de um container específico sem
  estabilizar.

#### "Memory Cached" (row: Memory)

- **O que mostra**: memória que o container está usando como cache de
  disco (recuperável pelo kernel se necessário, diferente da memória "real"
  do painel anterior).
- **Query**: `sum(container_memory_cache{instance=~"$docker_host",name=~"$container_name",name=~".+"}) by (name)`
  — Tradução: "memória em cache de cada container".
- **Normal/ocioso**: baixo para a maioria dos containers (o cache cresce
  mais em serviços com I/O de disco, como Postgres/Loki/Tempo).
- **Indica problema**: não é tipicamente motivo de alarme por si só (cache
  alto é até esperado) — olhe junto com "Memory Usage".

#### "Reads" (row: I/O)

- **O que mostra**: taxa de leitura de disco por container, em bytes/s.
- **Query**: `sum(rate(container_fs_reads_bytes_total{instance=~"$docker_host",name=~"$container_name",name=~".+"}[$__rate_interval])) by (name)`
  — Tradução: "quantos bytes por segundo cada container está lendo do
  disco".
- **Normal/ocioso**: medido em **~0 bytes/s** para todos os containers (sem
  tráfego real de aplicação no momento).
- **Indica problema**: picos altos e sustentados de leitura indicam
  processamento pesado de disco.

#### "Writes" (row: I/O)

- **O que mostra**: taxa de escrita de disco por container, em bytes/s.
- **Query**: `sum(rate(container_fs_writes_bytes_total{instance=~"$docker_host",name=~"$container_name",name=~".+"}[$__rate_interval])) by (name)`
  — Tradução: "quantos bytes por segundo cada container está escrevendo no
  disco".
- **Normal/ocioso**: baixo (picos ocasionais do Postgres/Loki/Tempo
  gravando dados).
- **Indica problema**: escrita muito alta e contínua, especialmente em
  containers que não deveriam estar gravando muito (ex.: o próprio
  backend-stub, que não grava nada em disco hoje).

#### "Received Network Traffic" (row: Network)

- **O que mostra**: tráfego de rede recebido por container, em bytes/s.
- **Query**: `sum(rate(container_network_receive_bytes_total{instance=~"$docker_host",name=~"$container_name",name=~".+"}[$__rate_interval])) by (name)`
  — Tradução: "quantos bytes por segundo cada container está recebendo pela
  rede".
- **Normal/ocioso**: `ai-podcast-backend-stub` medido em **~46 bytes/s**
  (basicamente só o probe do blackbox-exporter a cada 15s).
- **Indica problema**: picos altos e sustentados fora do padrão de uso.

#### "Sent Network Traffic" (row: Network)

- **O que mostra**: tráfego de rede enviado por container, em bytes/s.
- **Query**: `sum(rate(container_network_transmit_bytes_total{instance=~"$docker_host",name=~"$container_name",name=~".+"}[$__rate_interval])) by (name)`
  — Tradução: "quantos bytes por segundo cada container está enviando pela
  rede".
- **Normal/ocioso**: baixo, espelhando o "Received" (respostas pequenas aos
  probes/health checks).
- **Indica problema**: picos altos e sustentados fora do padrão de uso.

#### "Container Restarts" (row: Details, tipo heatmap)

- **O que mostra**: um mapa de calor de quantas vezes cada container foi
  "visto" pelo cAdvisor dentro da janela de tempo escolhida — na prática,
  serve como indicador indireto de containers reiniciando com frequência
  (cada restart reinicia a contagem de "last seen").
- **Query**: `count by(name) (count_over_time(container_last_seen{instance=~"$docker_host",name=~"$container_name",name=~".+"}[$__range]))`
  — Tradução: "conta quantas vezes cada container apareceu como 'visto' no
  período selecionado".
- **Normal/ocioso**: um valor estável e alto (o container está sempre
  presente, sendo "visto" a cada scrape do cAdvisor).
- **Indica problema**: esse painel some ou um container específico some do
  heatmap quando ele é parado — isso é esperado, não um bug (ver Simulação
  complexa abaixo).

---

## Parte 2 — Simulações para você executar

**Importante**: ninguém vai rodar essas simulações por você — a ideia é
você mesmo executar os comandos abaixo e observar os dashboards mudando.

### Simulação simples — gerar requisições reais contra o backend-stub

Esta simulação não derruba nada; ela só manda tráfego real de verdade contra
a rota `/process_video` do backend-stub (hoje só recebe tráfego do probe de
disponibilidade, na rota `/`).

**Passo 1 — Abra o dashboard antes de gerar a carga**

Abra `http://localhost:3001/d/backend-stub-red` no navegador (ou pelo menu:
Dashboards → "Backend Stub — RED (rate/errors/duration)"). Deixe essa aba
visível — ela já atualiza sozinha a cada 10s, não precisa apertar F5.

**Passo 2 — Gere a carga**

Em um terminal, rode este comando (copiável, sem necessidade de edição):

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "requisição $i: HTTP %{http_code} em %{time_total}s\n" \
    -X POST http://localhost:8001/process_video \
    -H "Content-Type: application/json" \
    --data-raw '{"s3_key":"experimento-observabilidade/simulacao-simples.mp4"}'
done
```

Isso faz 20 chamadas reais de "processar vídeo" em sequência contra o
backend-stub (cada uma demora entre 200ms e 1,5s, por causa da latência
simulada padrão — então o comando inteiro deve levar entre ~5 e ~30
segundos para terminar).

**Passo 3 — O que observar e quando**

No dashboard "Backend Stub — RED", observe:

- **Painel "Request rate (por rota)"**: a linha da rota `/process_video`
  deve subir de perto de zero para um valor visivelmente positivo, enquanto
  o comando do Passo 2 estiver rodando (e por um tempo depois, enquanto a
  janela de cálculo da taxa "esvazia"). Leva em torno de **15 a 30
  segundos** para aparecer depois do primeiro request (o OTel Collector
  processa métricas de spans em lotes de 15s, e o Prometheus coleta esses
  dados também a cada 15s) — não precisa de F5, o painel atualiza sozinho.
- **Painel "Latência p95 / p99 (ms, por rota)"**: deve subir da faixa
  "quase zero" (que reflete só o probe de health check) para algo dentro de
  200–1500ms na rota `/process_video` — essa é a primeira vez que esse
  painel mostra a latência real simulada, em vez do health check.
- **Painel "Disponibilidade"** e **"Taxa de erro"**: não devem mudar (o
  serviço continua no ar e sem erros).

**Opcional — cAdvisor**: abra também
`http://localhost:3001/d/ae3c41d7-cea5-4cca-a918-5708706b4d1a` e observe o
painel **"CPU Usage (% by Core)"**, filtrando visualmente pela linha
`ai-podcast-backend-stub`. Como o stub só dá um `time.sleep()` (não faz
nenhum trabalho de CPU pesado), a variação aqui tende a ser **pequena e
sutil** — pode não ser um salto dramático, e isso é esperado (o objetivo
real desta simulação é o dashboard Backend Stub RED).

---

### Simulação complexa — cenário `backend_indisponivel`

Esta simulação reaproveita o cenário já automatizado em
`scripts/experimento-observabilidade.sh` (e documentado manualmente em
`docs/pesquisa/experimento-observabilidade/roteiro-baseline.md`, Cenário 1) — aqui
vamos disparar os comandos manualmente para você poder observar os 3
dashboards em tempo real, no seu próprio ritmo, em vez de deixar o script
rodar e reverter sozinho.

Esse cenário foi escolhido porque é o único que afeta, ao mesmo tempo,
disponibilidade, taxa de requisições e métricas de container — é o mais
didático para ver vários dashboards reagindo à mesma causa.

**Passo 0 — Deixe os 3 dashboards abertos, em abas separadas, antes de
começar:**
- `http://localhost:3001/d/backend-stub-red`
- `http://localhost:3001/d/ae3c41d7-cea5-4cca-a918-5708706b4d1a` (cAdvisor)
- `http://localhost:3001/d/rYdddlPWk` (Node Exporter Full — troque a janela
  de tempo no canto superior direito de "Last 24 hours" para "Last 15
  minutes" antes de começar, senão a mudança fica pequena demais para
  perceber num gráfico de 24h)

**Passo 1 — Disparar a falha (T0)**

```bash
date -u +%Y-%m-%dT%H:%M:%SZ && docker stop ai-podcast-backend-stub
```

O timestamp impresso é o momento exato em que o container foi parado (T0).

**Passo 2 — O que vai mudar em cada dashboard, e quando**

*Backend Stub — RED:*
- **Painel "Disponibilidade"**: muda de **"UP"** (verde) para **"DOWN"**
  (vermelho) no próximo probe do blackbox-exporter — em até **15 a 30
  segundos** depois do T0 (o Prometheus raspa esse probe a cada 15s).
- **Painel "Request rate (por rota)"**: a linha da rota `/` (do probe) cai
  para zero junto com a disponibilidade. Como é uma taxa calculada sobre
  uma janela de tempo, a linha não "degrau" instantaneamente — ela desce
  suavemente ao longo de 1 a 2 minutos, até não haver mais nenhuma amostra
  recente na janela.
- **Painéis "Taxa de erro"** e **"Latência p95/p99"**: provavelmente passam
  a mostrar **"No data"**, porque não há mais nenhuma chamada acontecendo
  (isso é diferente de "erro" — é ausência completa de tráfego).

*cAdvisor:*
- **Painel "CPU Usage (% by Core)"** e **painel "Memory Usage"**: a série
  referente a `ai-podcast-backend-stub` para de receber novos pontos — ela
  não "cai para zero" visualmente, ela simplesmente **para de se mover e
  desaparece** da legenda/gráfico depois de alguns ciclos de coleta (o
  cAdvisor só reporta métricas de containers em execução). Espere isso
  dentro de **1 a 2 minutos** depois do T0.
- **Painel "Container Restarts" (heatmap)**: a linha de
  `ai-podcast-backend-stub` também para de acumular novas contagens.

*Node Exporter Full:*
- **Honestamente, não espere uma mudança visível aqui.** O `backend-stub` é
  um container leve (medido em ~0,2% de um núcleo e ~107MB de RAM, contra um
  host com dezenas de containers e vários GB de RAM disponíveis) — pará-lo
  não deve mover de forma perceptível os painéis "CPU Busy" ou "RAM Used",
  que medem a máquina inteira, não um container isolado. Isso não é uma
  falha do dashboard: é um bom exemplo de que métricas de host e métricas
  de container respondem a perguntas diferentes, e esse cenário específico
  só é "grande" do ponto de vista de disponibilidade/aplicação, não do
  ponto de vista de recursos de hardware.

**Passo 3 — Onde ver o alerta mudando de estado**

No menu lateral esquerdo do Grafana, clique no ícone de sino **"Alerting"**
→ **"Alert rules"** (ou acesse direto
`http://localhost:3001/alerting/list`). Procure, dentro da pasta/grupo
**"Observability" → "backend-stub-red"**, a regra **"Backend stub
indisponível (probe HTTP)"**. O estado dela muda assim:
- **Normal** (antes do T0);
- **Pending** (depois que `probe_success` vira 0, enquanto aguarda o tempo
  mínimo configurado de 1 minuto — regra `for: 1m`);
- **Firing** (ícone vermelho) — no experimento já medido anteriormente
  (`docs/pesquisa/experimento-observabilidade/resultados.csv`), esse cenário levou
  **~82 segundos** do T0 até a regra entrar em "Firing" (esse tempo é o
  MTTD/"mean time to detect" registrado para o grupo
  `com_observabilidade`).

**Passo 4 — Revertendo a falha**

```bash
docker start ai-podcast-backend-stub
```

Para confirmar que voltou antes de seguir:
```bash
until curl -sf -o /dev/null http://localhost:8001/; do sleep 1; done; date -u +%Y-%m-%dT%H:%M:%SZ
```

O que esperar voltando ao normal, por dashboard:
- **Backend Stub — RED**: "Disponibilidade" volta para "UP"/verde no
  próximo probe (~15-30s). "Request rate" volta a mostrar a linha baixa da
  rota `/` assim que os próximos probes forem bem-sucedidos.
- **cAdvisor**: a série `ai-podcast-backend-stub` reaparece do zero nos
  painéis de CPU/Memória (é um container "novo" do ponto de vista de
  métricas, mesmo com o mesmo nome).
- **Node Exporter Full**: permanece igual (consistente com não ter mudado
  na ida).
- **Alerta no Grafana**: volta de "Firing" para "Normal" — no experimento
  medido anteriormente, isso levou cerca de **61 segundos** depois do
  "Firing" (ou seja, reverter pode demorar um pouco mais do que detectar,
  porque a regra olha para uma janela de dados recente que precisa
  "esvaziar" o valor ruim).

---

## Resumo rápido dos 3 dashboards

| Dashboard | Pergunta que responde | Granularidade |
|---|---|---|
| Backend Stub — RED | "A minha aplicação está saudável (recebendo tráfego, sem erro, respondendo rápido)?" | Por rota/serviço da aplicação |
| Node Exporter Full | "A máquina/host como um todo está com recursos sobrando?" | Host inteiro |
| cAdvisor | "Qual container específico está consumindo o quê?" | Por container Docker |
