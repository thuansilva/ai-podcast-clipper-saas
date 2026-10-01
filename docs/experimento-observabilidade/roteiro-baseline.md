# Roteiro — medição manual do grupo "baseline" (sem observabilidade)

Este roteiro serve para medir, **à mão, com cronômetro**, o MTTD (tempo até
detectar o problema) dos mesmos 3 cenários de falha já automatizados em
`scripts/experimento-observabilidade.sh` — mas simulando uma equipe que **não
tem Grafana, Prometheus, alertas ou Tempo**. A única ferramenta permitida
aqui é o terminal com `docker`/`curl`, exatamente como uma equipe sem
observabilidade investigaria o problema.

Siga os passos na ordem, para cada um dos 3 cenários. Não é preciso saber
nada sobre o script automatizado — todos os comandos abaixo são autossuficientes
e copiáveis.

## Antes de começar (pré-requisitos, uma vez só)

1. Suba a stack local (precisamos do Postgres e do backend-stub rodando, mas
   **não** vamos abrir o Grafana nem olhar dashboards em nenhum momento
   deste roteiro):
   ```bash
   docker compose up -d
   ```
2. Para o cenário 3 (webhook Stripe), o frontend Next.js precisa estar
   rodando localmente. Em outro terminal:
   ```bash
   cd ai-podcast-clipper-frontend
   npm run dev
   ```
   Deixe esse terminal visível — ele será a sua fonte de "logs" no cenário 3.
3. Tenha um cronômetro (celular, relógio, app de cronômetro) à mão. Os
   comandos abaixo também imprimem timestamps (`date -u`) que você vai copiar
   para o CSV — o cronômetro é um apoio para você *perceber* o problema, mas
   quem vai para o CSV é sempre o timestamp impresso pelo terminal.
4. Abra (ou tenha pronto para colar) o arquivo
   `docs/experimento-observabilidade/resultados.csv`. As colunas, na ordem
   atual, são:
   ```
   cenario,grupo,timestamp_T0,timestamp_T1_alerta,mttd_segundos,trace_encontrado,timestamp_T2_resolvido
   ```
   Nas linhas que você for adicionar neste roteiro, `grupo` será sempre
   `baseline`.

> Nota sobre a coluna `trace_encontrado`: neste grupo baseline você não tem
> acesso ao Tempo/tracing (é exatamente isso que estamos simulando). Essa
> coluna **não se aplica** — preencha sempre com `n/a` nas linhas baseline (e
> não com "nao", para não confundir com "procurei e não achei" do grupo
> com observabilidade).

---

## Cenário 1 — `backend_indisponivel`

Simula o backend-stub (processamento de vídeo) caindo.

### Passo 1 — Preparar a detecção manual

Antes de injetar a falha, abra um segundo terminal dedicado (vamos usá-lo no
Passo 3) e tenha o comando abaixo pronto para rodar lá, mas **não rode
ainda**:
```bash
watch -n 2 'date -u +%Y-%m-%dT%H:%M:%SZ; curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8001/'
```
Esse comando repete, a cada 2 segundos, uma chamada real contra o backend-stub
(o mesmo endpoint que a aplicação usaria) e imprime o código HTTP retornado —
é o equivalente "sem observabilidade" de uma pessoa testando manualmente se a
funcionalidade de processar vídeo está no ar. (Não dá para usar `docker logs
-f` aqui: quando o container está parado, ele simplesmente não produz logs
novos — não haveria nada para "aparecer".)

### Passo 2 — Injetar a falha e registrar T0

No terminal principal, rode o comando abaixo. Ele imprime o timestamp (T0)
**imediatamente antes** de parar o container — copie esse valor:
```bash
date -u +%Y-%m-%dT%H:%M:%SZ && docker stop ai-podcast-backend-stub
```
Anote o timestamp impresso como `timestamp_T0`. Nesse mesmo instante, inicie
seu cronômetro (ou apenas confie nos timestamps — o cronômetro é só apoio
visual).

### Passo 3 — Detectar manualmente (T1)

Vá para o terminal preparado no Passo 1 e rode o `watch` agora:
```bash
watch -n 2 'date -u +%Y-%m-%dT%H:%M:%SZ; curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8001/'
```
Fique olhando a saída. Enquanto o backend está no ar, você verá `HTTP 200`.
No momento em que a chamada passar a falhar (erro de conexão, "Connection
refused", ou o `curl` retornar vazio/`HTTP 000`), **esse é o momento em que
você, como pessoa sem observabilidade, percebeu o problema**. Copie o
timestamp impresso imediatamente acima/junto dessa primeira falha — esse é o
`timestamp_T1_alerta` (aqui representando "detecção manual", já que não há
alerta de verdade).

Pare o `watch` com `Ctrl+C`.

### Passo 4 — Reverter a falha

Mesmo comando usado no script automatizado, para manter os grupos
comparáveis:
```bash
docker start ai-podcast-backend-stub
```

### Passo 5 — Confirmar volta ao normal (T2)

Repita a verificação manual até confirmar que voltou:
```bash
until curl -sf -o /dev/null http://localhost:8001/; do sleep 1; done; date -u +%Y-%m-%dT%H:%M:%SZ
```
O timestamp impresso ao final (quando o `curl` finalmente tiver sucesso) é o
`timestamp_T2_resolvido`.

### Passo 6 — Calcular o MTTD e preencher o CSV

`mttd_segundos` = `timestamp_T1_alerta` − `timestamp_T0`, em segundos. Você
pode calcular isso com:
```bash
T0="COLE_O_T0_AQUI"
T1="COLE_O_T1_AQUI"
echo $(( $(date -u -d "$T1" +%s) - $(date -u -d "$T0" +%s) ))
```
Adicione uma linha ao final de
`docs/experimento-observabilidade/resultados.csv` no formato:
```
backend_indisponivel,baseline,<T0>,<T1>,<mttd_segundos>,n/a,<T2>
```

---

## Cenário 2 — `latencia_alta`

Simula o backend-stub respondendo muito mais lento (sem gerar nenhum erro).

### Passo 1 — Injetar a falha e registrar T0

```bash
date -u +%Y-%m-%dT%H:%M:%SZ && STUB_LATENCY_MS_MIN=4000 STUB_LATENCY_MS_MAX=6000 docker compose up -d --force-recreate backend-stub
```
Anote o timestamp impresso (antes do recreate) como `timestamp_T0`. Espere o
comando terminar (o container precisa ficar saudável de novo) antes de ir
para o próximo passo.

Confirme que o container voltou a responder antes de seguir:
```bash
until curl -sf -o /dev/null http://localhost:8001/; do sleep 1; done
```

### Passo 2 — Detectar manualmente (T1)

Latência alta **não gera erro** — as chamadas continuam retornando 200, só
mais lentas. Por isso o critério de detecção aqui é diferente do cenário 1:
uma pessoa sem observabilidade perceberia isso fazendo uma chamada real e
notando que ela demora visivelmente mais que o normal (o range normal é
200–1500ms; o cenário de falha usa 4000–6000ms).

Critério claro de "percebi que ficou lento": **a primeira chamada manual que
demorar 3 segundos ou mais**.

Rode este comando repetidamente (uma chamada por vez — faça isso manualmente,
olhando o resultado a cada execução, para simular alguém testando a
funcionalidade de verdade):
```bash
date -u +%Y-%m-%dT%H:%M:%SZ && curl -s -o /dev/null -w "tempo de resposta: %{time_total}s\n" -X POST http://localhost:8001/process_video -H "Content-Type: application/json" --data-raw '{"s3_key":"experimento-observabilidade/latencia.mp4"}'
```
Repita esse comando a cada ~10 segundos. No momento em que o
"tempo de resposta" impresso for **>= 3s** pela primeira vez, você detectou o
problema manualmente. O timestamp impresso por **essa mesma execução** do
comando é o `timestamp_T1_alerta`.

### Passo 3 — Reverter a falha

Mesmo comando usado no script automatizado (range normal):
```bash
STUB_LATENCY_MS_MIN=200 STUB_LATENCY_MS_MAX=1500 docker compose up -d --force-recreate backend-stub
```
Espere o container voltar a responder:
```bash
until curl -sf -o /dev/null http://localhost:8001/; do sleep 1; done
```

### Passo 4 — Confirmar volta ao normal (T2)

Repita a chamada manual do Passo 2 algumas vezes. Quando o tempo de resposta
voltar a ficar visivelmente baixo (abaixo de 1.5s) de forma consistente (ex.:
2 chamadas seguidas abaixo de 1.5s), rode:
```bash
date -u +%Y-%m-%dT%H:%M:%SZ
```
e use esse timestamp como `timestamp_T2_resolvido`.

### Passo 5 — Calcular o MTTD e preencher o CSV

Mesmo cálculo do cenário 1:
```bash
T0="COLE_O_T0_AQUI"
T1="COLE_O_T1_AQUI"
echo $(( $(date -u -d "$T1" +%s) - $(date -u -d "$T0" +%s) ))
```
Adicione a linha:
```
latencia_alta,baseline,<T0>,<T1>,<mttd_segundos>,n/a,<T2>
```

---

## Cenário 3 — `falha_webhook_stripe`

Simula o Postgres indisponível causando falha ao processar um webhook do
Stripe (ex.: cancelamento de assinatura).

Pré-requisito: confirme que o frontend está no ar (`npm run dev`, ver seção
de pré-requisitos no topo deste roteiro) e deixe o terminal onde ele está
rodando visível — ele será sua fonte de "logs" neste cenário (equivalente ao
`docker logs -f` de um serviço containerizado).

### Passo 1 — Preparar o payload assinado (antes de injetar a falha)

Este endpoint de debug assina um payload de teste do Stripe localmente (sem
chamar a API real do Stripe), para você poder disparar o webhook manualmente.
Rode:
```bash
BODY='{"id":"evt_baseline_manual","object":"event","api_version":"2025-04-30.basil","created":1735689600,"type":"customer.subscription.deleted","data":{"object":{"id":"sub_experimento","object":"subscription","customer":"cus_experimento"}}}'

SIGN_RESP=$(curl -sf -X POST http://localhost:3000/api/dev-sign-stripe-payload --data-raw "$BODY")
echo "$SIGN_RESP"
```
Confirme na saída que `stripeSecretKeyMode` é `"test"` (se não for, **pare
aqui** — não prossiga fora do modo de teste do Stripe). Extraia o header de
assinatura:
```bash
HEADER=$(echo "$SIGN_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['header'])")
echo "$HEADER"
```

### Passo 2 — Injetar a falha e registrar T0

```bash
date -u +%Y-%m-%dT%H:%M:%SZ && docker stop ai-podcast-postgres
```
Anote o timestamp impresso como `timestamp_T0`.

### Passo 3 — Detectar manualmente (T1)

Com o Postgres fora do ar, dispare o webhook de teste manualmente (reusando
o `BODY` e `HEADER` do Passo 1) e observe o código HTTP retornado — é
exatamente a chamada real que o Stripe faria contra a sua aplicação:
```bash
date -u +%Y-%m-%dT%H:%M:%SZ && curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:3000/api/webhooks/stripe -H "stripe-signature: $HEADER" -H "Content-Type: application/json" --data-raw "$BODY"
```
Repita esse comando a cada ~5 segundos. Além disso, dê uma olhada no
terminal do `npm run dev` — com o Postgres fora do ar, deve aparecer um erro
de conexão com o banco no momento em que o webhook tenta persistir o evento.

O momento em que você primeiro vê:
- o `curl` retornando um código de erro (ex.: `500`), **ou**
- um erro/stack trace relacionado a banco de dados aparecendo no terminal do
  `npm run dev`

(o que vier primeiro) é o seu `timestamp_T1_alerta` — use o timestamp
impresso pela execução do `curl` correspondente (ou, se notou primeiro pelo
log do `npm run dev`, rode `date -u +%Y-%m-%dT%H:%M:%SZ` nesse instante e use
esse valor).

Nota: cada chamada usa o mesmo `id` de evento (`evt_baseline_manual`); isso é
aceitável aqui porque o objetivo é só provocar o erro de conexão com o banco,
não testar deduplicação de webhook.

### Passo 4 — Reverter a falha

```bash
docker start ai-podcast-postgres
```
Aguarde alguns segundos para o Postgres aceitar conexões:
```bash
sleep 5
```

### Passo 5 — Confirmar volta ao normal (T2)

Dispare o webhook manualmente de novo (mesmo comando do Passo 3) até ele
voltar a responder `HTTP 200`:
```bash
date -u +%Y-%m-%dT%H:%M:%SZ && curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:3000/api/webhooks/stripe -H "stripe-signature: $HEADER" -H "Content-Type: application/json" --data-raw "$BODY"
```
Quando o código retornado for `200`, o timestamp impresso por essa execução
é o `timestamp_T2_resolvido`.

### Passo 6 — Calcular o MTTD e preencher o CSV

Mesmo cálculo dos cenários anteriores:
```bash
T0="COLE_O_T0_AQUI"
T1="COLE_O_T1_AQUI"
echo $(( $(date -u -d "$T1" +%s) - $(date -u -d "$T0" +%s) ))
```
Adicione a linha:
```
falha_webhook_stripe,baseline,<T0>,<T1>,<mttd_segundos>,n/a,<T2>
```

---

## Resumo do que vai para o CSV

Ao final dos 3 cenários, você terá adicionado 3 linhas a
`docs/experimento-observabilidade/resultados.csv`, todas com `grupo=baseline`
e `trace_encontrado=n/a`:
```
backend_indisponivel,baseline,<T0>,<T1>,<mttd>,n/a,<T2>
latencia_alta,baseline,<T0>,<T1>,<mttd>,n/a,<T2>
falha_webhook_stripe,baseline,<T0>,<T1>,<mttd>,n/a,<T2>
```

Não é necessário fazer commit dessas alterações — apenas deixe o CSV
atualizado no working directory para revisão.
