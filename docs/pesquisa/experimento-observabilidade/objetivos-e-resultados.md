# Experimento de Observabilidade — Objetivos e Resultados

> Documento de consolidação para servir de base a um artigo. Registra o que o
> experimento se propôs a provar, a metodologia usada e **tudo que foi
> encontrado até agora**, incluindo o que ainda está pendente. Toda afirmação
> aqui vem da leitura de `resultados.csv`, `roteiro-baseline.md`,
> `guia-dashboards-grafana.md` e `scripts/experimento-observabilidade.sh` —
> nenhum número foi estimado ou citado de memória.

## 1. Pergunta de pesquisa / o que queremos provar

**Hipótese:** uma stack de observabilidade (OpenTelemetry + Prometheus +
Grafana Alerting + Tempo) reduz o MTTD (*mean time to detect*, tempo entre a
falha começar e ela ser detectada) de falhas de produção, comparado a uma
equipe que investiga só com terminal (`docker`, `curl`, logs), sem dashboards
nem alertas.

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
4. Medir o MTTD dos mesmos cenários no grupo **`baseline`** (detecção manual,
   roteiro cronometrado, sem dashboards/alertas/tracing).
5. Comparar quantitativamente o MTTD entre os dois grupos, por tipo de
   falha, para concluir se — e em qual magnitude — a observabilidade reduz o
   tempo de detecção.

## 2. Metodologia

### 2.1 Cenários de falha

Definidos para cobrir os pontos mais sensíveis do pipeline do produto:

| Cenário | O que simula | Como é injetado |
|---|---|---|
| `backend_indisponivel` | Backend de processamento de vídeo cai | `docker stop` no container do backend-stub |
| `latencia_alta` | Backend continua no ar, mas responde muito mais lento, sem gerar erro | Recria o backend-stub com `STUB_LATENCY_MS_MIN/MAX` elevado para 4000–6000ms (range normal: 200–1500ms) |
| `falha_webhook_stripe` | Falha de infraestrutura (Postgres indisponível) afetando um fluxo crítico de billing | `docker stop` no Postgres + disparo de um webhook Stripe assinado localmente (modo teste) |

### 2.2 Grupo `com_observabilidade`

Medido via `scripts/experimento-observabilidade.sh`: o script injeta a
falha, faz polling até a regra de alerta correspondente no Grafana entrar em
**Firing**, reverte a falha, faz polling até voltar a **Normal**, e grava uma
linha no CSV com T0 (injeção), T1 (alerta disparou), MTTD (T1−T0), se um
trace da falha foi encontrado no Tempo, e T2 (resolvido).

### 2.3 Grupo `baseline`

Roteiro manual (`roteiro-baseline.md`) para repetir os mesmos 3 cenários
**sem** abrir Grafana/Prometheus/Tempo em nenhum momento — só terminal:
`watch` + `curl` para disponibilidade, chamadas manuais repetidas cronometrando
latência percebida (critério: primeira chamada ≥ 3s), e observação do log do
`npm run dev` para o erro de banco no cenário do webhook. Os mesmos T0/T1/T2
são registrados à mão, com `trace_encontrado=n/a` (esse grupo não tem acesso a
tracing, por definição).

### 2.4 Dashboards usados para detectar (grupo `com_observabilidade`)

Documentados painel a painel em `guia-dashboards-grafana.md`, com queries
PromQL confirmadas lendo o JSON real de cada dashboard via API do Grafana:

- **Backend Stub — RED** (customizado para o projeto): rate por rota, taxa de
  erro, latência p95/p99 por rota, disponibilidade via probe HTTP
  (blackbox-exporter). É o dashboard usado para detectar os 3 cenários.
- **Node Exporter Full** (dashboard oficial, ID 1860): métricas de host (CPU,
  memória, disco, rede, load average).
- **cAdvisor** (dashboard oficial, ID 21743): métricas por container Docker.

## 3. Resultados encontrados

### 3.1 Grupo `com_observabilidade` — medido em 2026-09-30

Dados de `resultados.csv`:

| Cenário | T0 | T1 (alerta) | MTTD | Trace encontrado no Tempo? | T2 (resolvido) |
|---|---|---|---|---|---|
| `backend_indisponivel` | 2026-09-30T04:28:09Z | 2026-09-30T04:29:31Z | **82s** | não | 2026-09-30T04:30:32Z |
| `latencia_alta` | 2026-09-30T04:40:36Z | 2026-09-30T04:43:36Z | **180s** | não | 2026-09-30T04:49:37Z |
| `falha_webhook_stripe` | 2026-09-30T05:07:22Z | 2026-09-30T05:10:11Z | **169s** | **sim** | 2026-09-30T05:15:41Z |

Achados qualitativos (de `guia-dashboards-grafana.md`, Parte 2):

- **`backend_indisponivel`**: a regra de alerta "Backend stub indisponível
  (probe HTTP)" passa por Normal → Pending (após `probe_success` virar 0,
  aguardando `for: 1m`) → Firing. Medido: **82s** do T0 até Firing, e **~61s**
  de Firing até voltar a Normal após o `docker start`. O painel "Request
  rate" não cai em degrau — desce suavemente em 1–2min (janela de cálculo de
  taxa). O cAdvisor para de reportar a série do container (não zera, some).
  O Node Exporter Full **não mostra mudança perceptível** — o container é
  leve (~0,2% CPU, ~107MB) frente ao host inteiro.
- **`latencia_alta`**: foi o cenário com **maior MTTD (180s)** — consistente
  com as regras de alerta usarem `rate(...[5m])`: tanto detectar quanto
  confirmar a volta ao normal depende de uma janela de 5 minutos "esvaziar"
  os valores ruins/bons.
- **`falha_webhook_stripe`**: único cenário em que o **trace foi encontrado**
  no Tempo — é o único cenário que efetivamente gera uma requisição HTTP
  completa com trace de ponta a ponta (webhook → tentativa de persistência no
  Postgres) no momento da falha; os outros dois cenários (`backend_indisponivel`,
  `latencia_alta`) não têm uma busca de trace equivalente, por isso
  `trace_encontrado=não` nessas linhas.

### 3.2 Grupo `baseline` — medido em 2026-10-07

Executado seguindo `roteiro-baseline.md`, com o próprio pesquisador olhando
o terminal e cronometrando via timestamps impressos (sem Grafana/Prometheus/
Tempo abertos em nenhum momento). Dados de `resultados.csv`:

| Cenário | T0 | T1 (detecção manual) | MTTD | T2 (resolvido) |
|---|---|---|---|---|
| `backend_indisponivel` | 2026-10-07T07:03:07Z | 2026-10-07T07:03:33Z | **26s** | 2026-10-07T07:04:04Z |
| `latencia_alta` | 2026-10-07T07:07:08Z | 2026-10-07T07:08:37Z | **89s** | 2026-10-07T07:11:20Z |
| `falha_webhook_stripe` | 2026-10-07T07:18:33Z | 2026-10-07T07:18:53Z | **20s** | 2026-10-07T07:22:56Z |

Observações registradas durante a execução:

- **`backend_indisponivel`**: detectado via `watch -n 2` + `curl` repetido —
  a primeira falha de conexão já apareceu na primeira iteração visível após
  o `docker stop`.
- **`latencia_alta`**: a primeira chamada manual, feita ~1min30s após a
  injeção da falha, já veio com 4.5s de latência (acima do limiar de 3s) —
  ou seja, detectada na primeira tentativa.
- **`falha_webhook_stripe`**: o primeiro disparo manual do webhook após o
  `docker stop` do Postgres já retornou `HTTP 500`, confirmado também pelo
  stack trace de `PrismaClientKnownRequestError: Can't reach database
  server` no log do `npm run dev` no mesmo timestamp (`07:18:53`). Durante a
  tentativa de confirmar o T2, uma assinatura de webhook reaproveitada expirou
  (tolerância padrão de 5 minutos do `stripe.webhooks.constructEvent`,
  `route.ts:35`) e gerou `HTTP 400` por alguns ciclos — resolvido re-assinando
  o payload (`/api/dev-sign-stripe-payload`) antes do disparo final; isso não
  afeta o T1 já capturado, só adiou a confirmação do T2.

## 4. Comparação final e conclusão

| Cenário | MTTD `com_observabilidade` | MTTD `baseline` | Diferença |
|---|---|---|---|
| `backend_indisponivel` | 82s | 26s | baseline **56s mais rápido** |
| `latencia_alta` | 180s | 89s | baseline **91s mais rápido** |
| `falha_webhook_stripe` | 169s | 20s | baseline **149s mais rápido** |

**Resultado: a hipótese original não se confirmou.** Nos 3 cenários, a
detecção manual (`baseline`) foi mais rápida que o alerta automático do
Grafana (`com_observabilidade`) — o oposto do que se esperava.

### Por que isso aconteceu (e o que isso prova de fato)

Isso **não significa que observabilidade seja pior que detecção manual** em
produção. O resultado reflete uma particularidade do desenho do
experimento:

1. **As regras de alerta têm atraso proposital, por design.** Elas usam
   `for: 1m` (disponibilidade) e janelas `rate(...[5m])` (erro/latência) —
   mecanismos para evitar falsos positivos em picos momentâneos. Esse
   atraso é uma escolha de engenharia (trade-off ruído vs. velocidade), não
   uma limitação da observabilidade em si.
2. **O baseline, aqui, não foi "alguém que não sabia que algo ia quebrar".**
   Em todos os 3 cenários, o pesquisador injetou a falha e **já sabia
   exatamente quando ela começou**, testando ativamente logo em seguida
   (a primeira tentativa manual, em todos os casos, já detectou o problema).
   Isso é bem diferente do cenário real que o experimento queria simular —
   uma equipe que **não está olhando para nada**, e só percebe o problema
   quando um usuário reclama, ou por acaso, ou numa verificação de rotina.
   O verdadeiro "custo" da falta de observabilidade em produção não é o
   tempo entre a falha e a primeira checagem manual *imediata* — é o tempo
   entre a falha e a **próxima vez que alguém, por acaso ou rotina, decide
   checar** aquele sistema. Esse tempo não foi medido aqui.
3. Logo, o que este experimento prova de fato é mais restrito:
   **para os 3 cenários testados, um alerta automático com janela de
   agregação de 1–5 minutos é mais lento para disparar do que uma pessoa
   testando manualmente no instante exato da falha.** Isso é esperado e não
   é surpreendente — não prova nada sobre o valor da observabilidade quando
   ninguém está testando manualmente, que é o cenário que ela resolve na
   prática.

### O que já está comprovado

- É possível instrumentar a aplicação com métricas RED + tracing e obter
  detecção automática via Grafana Alerting para os 3 cenários definidos
  (objetivos 1–3 cumpridos).
- Os MTTDs medidos com observabilidade variam de **82s a 180s**, dependendo
  do tipo de falha — falhas "silenciosas" (latência alta, sem erro) levam
  mais tempo para disparar alerta do que falhas "binárias" (serviço fora do
  ar).
- Tracing distribuído (Tempo) só se mostrou útil, neste experimento, para
  investigar a causa raiz de uma falha que já gera uma requisição completa
  (o webhook do Stripe); para indisponibilidade total ou ausência de
  tráfego, não há trace a ser buscado.
- O MTTD baseline medido (20–89s) é o tempo de detecção **de alguém testando
  ativamente logo após a falha** — não o tempo de detecção de uma equipe
  real sem observabilidade, que só perceberia por acaso ou via reclamação de
  usuário.

### O que ainda não está provado (gap para o artigo)

- A hipótese real de interesse — "sem observabilidade, quanto tempo uma
  equipe leva pra notar uma falha que não está ativamente procurando?" —
  não foi testada. Isso exigiria um desenho diferente (ex.: intervalo de
  checagem de rotina realista, ou tempo até reclamação de usuário simulada),
  não uma pessoa testando no instante exato da injeção.
- Os limiares das regras de alerta (`for: 1m`, janelas de 5min) não foram
  comparados com nenhum SLO/SLA real do produto — não dá pra afirmar se
  82–180s é "rápido" ou "lento" o suficiente sem esse contexto.

## 5. Próximo passo (se o artigo for retomado)

Redesenhar a medição do `baseline` para simular ausência real de vigilância
— por exemplo, definindo um intervalo de checagem de rotina (ex.: "a cada
30min alguém olha o sistema") e medindo o MTTD a partir daí, em vez de medir
o tempo de reação de alguém que acabou de injetar a própria falha.
