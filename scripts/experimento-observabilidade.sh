#!/usr/bin/env bash
#
# Experimento de MTTD (mean time to detect) automatizado para 3 cenários de
# falha repetíveis, usando a stack de observabilidade local (OTel Collector
# + Prometheus + spanmetrics + Grafana Alerting + Tempo).
#
# Uso:
#   ./scripts/experimento-observabilidade.sh <cenario>
#
# Cenários suportados:
#   backend_indisponivel   - para o container do backend-stub (docker stop)
#   latencia_alta          - eleva STUB_LATENCY_MS_MIN/MAX do backend-stub
#   falha_webhook_stripe   - derruba o Postgres e dispara webhooks Stripe
#                            (assinados localmente, sem chamada real à API
#                            do Stripe - ver docs/experimento-observabilidade/)
#
# Cada execução adiciona UMA linha ao CSV
# docs/experimento-observabilidade/resultados.csv com:
#   cenario,grupo,timestamp_T0,timestamp_T1_alerta,mttd_segundos,trace_encontrado,timestamp_T2_resolvido
# Este script sempre mede o grupo "com_observabilidade" (usa Grafana
# Alerting/Tempo para detectar). O grupo "baseline" (detecção manual, sem
# ferramentas) é medido à mão - ver
# docs/experimento-observabilidade/roteiro-baseline.md.
#
# Pré-requisitos (ver docs/experimento-observabilidade/ para detalhes):
#   - Stack local no ar: `docker compose up -d` (postgres, otel-collector,
#     prometheus, tempo, grafana, backend-stub, blackbox-exporter).
#   - Para o cenário falha_webhook_stripe: o frontend Next.js rodando
#     localmente (`npm run dev` dentro de ai-podcast-clipper-frontend/),
#     escutando em $FRONTEND_URL (default http://localhost:3000).

set -euo pipefail

# --------------------------------------------------------------------------
# Configuração (todas sobrescrevíveis via env var)
# --------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
TEMPO_URL="${TEMPO_URL:-http://localhost:3200}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_STUB_URL="${BACKEND_STUB_URL:-http://localhost:8001}"
BACKEND_STUB_CONTAINER="${BACKEND_STUB_CONTAINER:-ai-podcast-backend-stub}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ai-podcast-postgres}"

POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-3}"
# 420s (7min): todas as regras de erro/latência usam rate(...[5m]) - depois
# de reverter a falha, a métrica ainda reflete a janela ruim por até 5min: o
# timeout de polling (usado tanto para detectar Firing quanto para detectar
# a volta a Normal) precisa comportar isso com folga, não só o "for" da regra.
POLL_TIMEOUT_SECONDS="${POLL_TIMEOUT_SECONDS:-420}"
TEMPO_SEARCH_RETRY_SECONDS="${TEMPO_SEARCH_RETRY_SECONDS:-20}"

# Latência induzida no cenário "latencia_alta" (ms) - bem acima do limiar de
# alerta (2000ms de p95) e do range normal (200-1500ms, ver docker-compose.yml).
LATENCY_HIGH_MIN_MS="${LATENCY_HIGH_MIN_MS:-4000}"
LATENCY_HIGH_MAX_MS="${LATENCY_HIGH_MAX_MS:-6000}"
# Range normal, usado para reverter o cenário.
LATENCY_NORMAL_MIN_MS="${LATENCY_NORMAL_MIN_MS:-200}"
LATENCY_NORMAL_MAX_MS="${LATENCY_NORMAL_MAX_MS:-1500}"

CSV_DIR="$REPO_ROOT/docs/experimento-observabilidade"
CSV_PATH="$CSV_DIR/resultados.csv"
CSV_HEADER="cenario,grupo,timestamp_T0,timestamp_T1_alerta,mttd_segundos,trace_encontrado,timestamp_T2_resolvido"
# Grupo registrado por este script em toda linha que ele gera (ver
# docs/experimento-observabilidade/roteiro-baseline.md para o grupo
# "baseline", preenchido manualmente).
CSV_GRUPO="com_observabilidade"

# PID de processo de tráfego de fundo (usado nos cenários latencia_alta e
# falha_webhook_stripe), pra garantir que é sempre encerrado (inclusive em
# caso de erro/timeout) via trap.
TRAFFIC_PID=""

log() {
  echo "[experimento] $*" >&2
}

die() {
  echo "[experimento][ERRO] $*" >&2
  exit 1
}

cleanup_traffic() {
  if [ -n "$TRAFFIC_PID" ] && kill -0 "$TRAFFIC_PID" 2>/dev/null; then
    kill "$TRAFFIC_PID" 2>/dev/null || true
    wait "$TRAFFIC_PID" 2>/dev/null || true
  fi
  TRAFFIC_PID=""
}
trap cleanup_traffic EXIT

require_container() {
  local name="$1"
  if ! docker inspect "$name" >/dev/null 2>&1; then
    die "Container '$name' não existe. Rode 'docker compose up -d' primeiro."
  fi
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

epoch_now() {
  date -u +%s
}

# --------------------------------------------------------------------------
# Grafana Alerting API
# --------------------------------------------------------------------------

# Retorna o estado (inactive|pending|firing) da regra cujo título (não uid -
# a API Prometheus-compatible do Grafana expõe só o título) é passado.
# Ecoa string vazia se a regra não for encontrada.
rule_state() {
  local rule_title="$1"
  curl -sf "$GRAFANA_URL/api/prometheus/grafana/api/v1/rules" 2>/dev/null | python3 -c "
import json, sys
title = sys.argv[1]
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for g in d.get('data', {}).get('groups', []):
    for r in g.get('rules', []):
        if r.get('name') == title:
            print(r.get('state', ''))
            sys.exit(0)
" "$rule_title"
}

# Faz polling até a regra atingir o estado alvo (ex.: "firing" ou
# "inactive"). Imprime o timestamp ISO 8601 UTC do momento em que o estado
# alvo foi observado. Sai com erro se estourar o timeout de segurança.
wait_for_rule_state() {
  local rule_title="$1"
  local target_state="$2"
  local timeout="$POLL_TIMEOUT_SECONDS"
  local elapsed=0

  while [ "$elapsed" -lt "$timeout" ]; do
    local state
    state="$(rule_state "$rule_title")"
    log "regra '$rule_title': estado atual = '${state:-<sem resposta>}' (aguardando '$target_state', ${elapsed}s/${timeout}s)"
    if [ "$state" = "$target_state" ]; then
      iso_now
      return 0
    fi
    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  die "Timeout de ${timeout}s esperando a regra '$rule_title' atingir o estado '$target_state'. Estado final: '$(rule_state "$rule_title")'."
}

# --------------------------------------------------------------------------
# Tempo (busca de trace de erro na janela T0-T1)
# --------------------------------------------------------------------------

# Confirma se existe um trace com span de erro para $service_name dentro da
# janela [start_epoch, end_epoch]. Ecoa "sim" ou "nao".
#
# Nota importante (ver docs/observabilidade.md item 1): o /api/search do
# Tempo tem delay de indexação. Por isso tentamos algumas vezes dentro de um
# pequeno orçamento de espera antes de concluir "nao" - mas um "nao" aqui
# não é prova definitiva de ausência, só de que não foi encontrado dentro do
# orçamento de espera do experimento.
check_tempo_error_trace() {
  local service_name="$1"
  local start_epoch="$2"
  local end_epoch="$3"
  local budget="$TEMPO_SEARCH_RETRY_SECONDS"
  local elapsed=0
  local encoded_query
  encoded_query=$(python3 -c "
import urllib.parse, sys
svc = sys.argv[1]
print(urllib.parse.quote('{resource.service.name=\"' + svc + '\" && status=error}'))
" "$service_name")

  while [ "$elapsed" -le "$budget" ]; do
    local found
    found=$(curl -sf "$TEMPO_URL/api/search?q=${encoded_query}&start=${start_epoch}&end=${end_epoch}&limit=5" 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print('0')
    sys.exit(0)
print(len(d.get('traces', [])))
" || echo "0")
    if [ "${found:-0}" -gt 0 ] 2>/dev/null; then
      log "Tempo: encontrado(s) $found trace(s) de erro para '$service_name' na janela."
      echo "sim"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  log "Tempo: nenhum trace de erro encontrado para '$service_name' na janela (após ${budget}s de tentativas)."
  echo "nao"
}

# --------------------------------------------------------------------------
# CSV
# --------------------------------------------------------------------------

ensure_csv() {
  mkdir -p "$CSV_DIR"
  if [ ! -f "$CSV_PATH" ]; then
    echo "$CSV_HEADER" > "$CSV_PATH"
  fi
}

append_csv_row() {
  local cenario="$1" t0="$2" t1="$3" mttd="$4" trace_found="$5" t2="$6"
  ensure_csv
  echo "${cenario},${CSV_GRUPO},${t0},${t1},${mttd},${trace_found},${t2}" >> "$CSV_PATH"
  log "Linha registrada em $CSV_PATH"
}

seconds_between() {
  local t0_iso="$1" t1_iso="$2"
  local t0_epoch t1_epoch
  t0_epoch=$(date -u -d "$t0_iso" +%s)
  t1_epoch=$(date -u -d "$t1_iso" +%s)
  echo $((t1_epoch - t0_epoch))
}

# --------------------------------------------------------------------------
# Cenário 1: backend_indisponivel
# --------------------------------------------------------------------------
scenario_backend_indisponivel() {
  local rule_title="Backend stub indisponível (probe HTTP)"
  require_container "$BACKEND_STUB_CONTAINER"

  local pre_state
  pre_state="$(rule_state "$rule_title")"
  [ "$pre_state" = "inactive" ] || die "Pré-condição falhou: a regra '$rule_title' já não está 'inactive' (está '$pre_state'). Aguarde estabilizar antes de rodar o experimento."

  local t0 t0_epoch t1 t1_epoch t2
  t0="$(iso_now)"
  t0_epoch=$(date -u -d "$t0" +%s)
  log "T0=$t0 - parando $BACKEND_STUB_CONTAINER"
  docker stop "$BACKEND_STUB_CONTAINER" >/dev/null

  t1="$(wait_for_rule_state "$rule_title" "firing")"
  t1_epoch=$(date -u -d "$t1" +%s)
  log "T1=$t1 (alerta 'firing')"

  # Serviço estava totalmente indisponível (sem processo respondendo): não
  # há span de aplicação possível nessa janela - o probe HTTP externo
  # (blackbox-exporter) é o único sinal, por definição não gera trace. O
  # "nao" esperado aqui documenta exatamente essa limitação (ver
  # observability/grafana/provisioning/alerting/backend-stub-red.yaml).
  local trace_found
  trace_found="$(check_tempo_error_trace "ai-podcast-clipper-backend-stub" "$t0_epoch" "$t1_epoch")"

  log "religando $BACKEND_STUB_CONTAINER"
  docker start "$BACKEND_STUB_CONTAINER" >/dev/null
  t2="$(wait_for_rule_state "$rule_title" "inactive")"
  log "T2=$t2 (alerta voltou a 'inactive')"

  local mttd
  mttd=$(seconds_between "$t0" "$t1")
  append_csv_row "backend_indisponivel" "$t0" "$t1" "$mttd" "$trace_found" "$t2"
}

# --------------------------------------------------------------------------
# Cenário 2: latencia_alta
# --------------------------------------------------------------------------
recreate_backend_stub_with_latency() {
  local min_ms="$1" max_ms="$2"
  log "recriando $BACKEND_STUB_CONTAINER com STUB_LATENCY_MS_MIN=$min_ms STUB_LATENCY_MS_MAX=$max_ms"
  (
    cd "$REPO_ROOT"
    STUB_LATENCY_MS_MIN="$min_ms" STUB_LATENCY_MS_MAX="$max_ms" \
      docker compose up -d --force-recreate backend-stub >/dev/null
  )
  # Espera o health check responder antes de gerar tráfego.
  local tries=0
  until curl -sf -o /dev/null "$BACKEND_STUB_URL/"; do
    tries=$((tries + 1))
    [ "$tries" -le 30 ] || die "backend-stub não voltou a responder depois de recriado."
    sleep 1
  done
}

start_process_video_traffic() {
  (
    while true; do
      curl -sf -o /dev/null -X POST "$BACKEND_STUB_URL/process_video" \
        -H "Content-Type: application/json" \
        --data-raw '{"s3_key":"experimento-observabilidade/latencia.mp4"}' || true
      sleep 1
    done
  ) &
  TRAFFIC_PID=$!
  log "gerador de tráfego (process_video) iniciado, PID=$TRAFFIC_PID"
}

scenario_latencia_alta() {
  local rule_title="Latência alta no backend-stub (p95)"
  require_container "$BACKEND_STUB_CONTAINER"

  local pre_state
  pre_state="$(rule_state "$rule_title")"
  [ "$pre_state" = "inactive" ] || die "Pré-condição falhou: a regra '$rule_title' já não está 'inactive' (está '$pre_state')."

  local t0 t0_epoch t1 t1_epoch t2
  t0="$(iso_now)"
  t0_epoch=$(date -u -d "$t0" +%s)
  log "T0=$t0 - elevando latência do backend-stub"
  recreate_backend_stub_with_latency "$LATENCY_HIGH_MIN_MS" "$LATENCY_HIGH_MAX_MS"
  start_process_video_traffic

  t1="$(wait_for_rule_state "$rule_title" "firing")"
  t1_epoch=$(date -u -d "$t1" +%s)
  log "T1=$t1 (alerta 'firing')"

  # Latência alta não é, por si só, um erro: as chamadas continuam
  # retornando 200 (só mais lentas). Não esperamos span de status=error
  # aqui - "nao" é o resultado correto/esperado para este cenário.
  local trace_found
  trace_found="$(check_tempo_error_trace "ai-podcast-clipper-backend-stub" "$t0_epoch" "$t1_epoch")"

  cleanup_traffic
  log "revertendo latência do backend-stub para o range normal"
  recreate_backend_stub_with_latency "$LATENCY_NORMAL_MIN_MS" "$LATENCY_NORMAL_MAX_MS"
  t2="$(wait_for_rule_state "$rule_title" "inactive")"
  log "T2=$t2 (alerta voltou a 'inactive')"

  local mttd
  mttd=$(seconds_between "$t0" "$t1")
  append_csv_row "latencia_alta" "$t0" "$t1" "$mttd" "$trace_found" "$t2"
}

# --------------------------------------------------------------------------
# Cenário 3: falha_webhook_stripe
# --------------------------------------------------------------------------

# Assina (localmente, via endpoint de debug do próprio Next.js - nunca
# expondo o STRIPE_WEBHOOK_SECRET em si) e envia um evento de teste
# (customer.subscription.deleted, sem nenhuma chamada de rede à API real do
# Stripe) contra a rota do webhook. Ecoa o código HTTP retornado.
send_signed_stripe_webhook() {
  local event_id="evt_experimento_$(date -u +%s%N)"
  local body
  body=$(python3 -c "
import json, sys
event_id = sys.argv[1]
print(json.dumps({
    'id': event_id,
    'object': 'event',
    'api_version': '2025-04-30.basil',
    'created': 1735689600,
    'type': 'customer.subscription.deleted',
    'data': {
        'object': {
            'id': 'sub_experimento',
            'object': 'subscription',
            'customer': 'cus_experimento',
        }
    },
}))
" "$event_id")

  local sign_resp header
  sign_resp=$(curl -sf -X POST "$FRONTEND_URL/api/dev-sign-stripe-payload" --data-raw "$body") || {
    echo "000"
    return 0
  }
  header=$(echo "$sign_resp" | python3 -c "
import json, sys
try:
    print(json.load(sys.stdin)['header'])
except Exception:
    print('')
")
  [ -n "$header" ] || { echo "000"; return 0; }

  curl -s -o /dev/null -w "%{http_code}" -X POST "$FRONTEND_URL/api/webhooks/stripe" \
    -H "stripe-signature: $header" \
    -H "Content-Type: application/json" \
    --data-raw "$body"
}

check_frontend_prereqs() {
  curl -sf -o /dev/null "$FRONTEND_URL/api/health" || die \
"Frontend não está respondendo em $FRONTEND_URL/api/health. Rode 'npm run dev' dentro de ai-podcast-clipper-frontend/ antes de rodar o cenário falha_webhook_stripe."

  local sign_resp mode
  sign_resp=$(curl -sf -X POST "$FRONTEND_URL/api/dev-sign-stripe-payload" --data-raw '{"probe":true}') || die \
"Endpoint de debug $FRONTEND_URL/api/dev-sign-stripe-payload não respondeu. Ele é necessário para assinar o payload de teste do Stripe sem usar o Stripe CLI (não instalado/autenticado neste ambiente)."
  mode=$(echo "$sign_resp" | python3 -c "
import json, sys
try:
    print(json.load(sys.stdin).get('stripeSecretKeyMode', ''))
except Exception:
    print('')
")
  [ "$mode" = "test" ] || die \
"STRIPE_SECRET_KEY configurado não está em modo test (esperado prefixo sk_test_). Abortando por segurança - não prosseguir com testes de webhook Stripe fora do modo test."
  log "Confirmado: STRIPE_SECRET_KEY em modo test."
}

start_stripe_webhook_traffic() {
  (
    while true; do
      send_signed_stripe_webhook >/dev/null || true
      sleep 2
    done
  ) &
  TRAFFIC_PID=$!
  log "gerador de tráfego (webhook Stripe) iniciado, PID=$TRAFFIC_PID"
}

scenario_falha_webhook_stripe() {
  local rule_title="Taxa de erro alta no webhook do Stripe (frontend)"
  require_container "$POSTGRES_CONTAINER"
  check_frontend_prereqs

  local pre_state
  pre_state="$(rule_state "$rule_title")"
  [ "$pre_state" = "inactive" ] || die "Pré-condição falhou: a regra '$rule_title' já não está 'inactive' (está '$pre_state')."

  local t0 t0_epoch t1 t1_epoch t2
  t0="$(iso_now)"
  t0_epoch=$(date -u -d "$t0" +%s)
  log "T0=$t0 - parando $POSTGRES_CONTAINER"
  docker stop "$POSTGRES_CONTAINER" >/dev/null
  start_stripe_webhook_traffic

  t1="$(wait_for_rule_state "$rule_title" "firing")"
  t1_epoch=$(date -u -d "$t1" +%s)
  log "T1=$t1 (alerta 'firing')"

  local trace_found
  trace_found="$(check_tempo_error_trace "ai-podcast-clipper-frontend" "$t0_epoch" "$t1_epoch")"

  cleanup_traffic
  log "religando $POSTGRES_CONTAINER"
  docker start "$POSTGRES_CONTAINER" >/dev/null
  # Dá um tempo para o Postgres aceitar conexões antes de considerar o
  # alerta "resolvido" de forma consistente (o healthcheck do compose usa
  # pg_isready, mas aqui fazemos uma espera simples e suficiente).
  sleep 5
  t2="$(wait_for_rule_state "$rule_title" "inactive")"
  log "T2=$t2 (alerta voltou a 'inactive')"

  local mttd
  mttd=$(seconds_between "$t0" "$t1")
  append_csv_row "falha_webhook_stripe" "$t0" "$t1" "$mttd" "$trace_found" "$t2"
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
usage() {
  cat >&2 <<EOF
Uso: $0 <cenario>

Cenários disponíveis:
  backend_indisponivel
  latencia_alta
  falha_webhook_stripe
EOF
}

main() {
  local scenario="${1:-}"
  [ -n "$scenario" ] || { usage; exit 1; }

  curl -sf -o /dev/null "$GRAFANA_URL/api/health" || die "Grafana não está respondendo em $GRAFANA_URL. Rode 'docker compose up -d' primeiro."

  case "$scenario" in
    backend_indisponivel)
      scenario_backend_indisponivel
      ;;
    latencia_alta)
      scenario_latencia_alta
      ;;
    falha_webhook_stripe)
      scenario_falha_webhook_stripe
      ;;
    *)
      usage
      die "Cenário desconhecido: '$scenario'"
      ;;
  esac
}

main "$@"
