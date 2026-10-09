#!/usr/bin/env bash
#
# test-everything.sh — "modo completo": roda unitários + integração + smoke
# de carga numa única execução, subindo tudo que for necessário (Postgres,
# app Next.js buildado, Inngest dev server).
#
# Isto é um MODO ADICIONAL para rodar localmente antes de considerar uma
# tarefa pronta — não substitui os scripts individuais (`npm run test`,
# `npm run test:integration`, `npm run test:all`, `npm run test:load:*`),
# que continuam existindo e são o que a CI (.github/workflows/ci.yml) usa
# por trás (este script reaproveita exatamente as mesmas env vars fake/dummy
# e o mesmo padrão de polling de saúde que o CI já usa, só que também cobre
# o smoke de carga, que a CI não roda).
#
# Uso:
#   npm run test:everything
#   (ou diretamente: bash scripts/test-everything.sh)
#
# Pré-requisito: Docker + Docker Compose (para subir o Postgres de teste via
# docker-compose.yml na raiz do monorepo).
#
set -euo pipefail

# --- Caminhos -----------------------------------------------------------
# Este script é chamado via "npm run test:everything" com cwd =
# ai-podcast-clipper-frontend/ (onde está o package.json), mas resolvemos os
# caminhos de forma robusta mesmo se for chamado diretamente de outro lugar.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${FRONTEND_DIR}/.." && pwd)"

cd "${FRONTEND_DIR}"

# --- Config ---------------------------------------------------------------
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/ai_podcast_clipper?connection_limit=5"
APP_PORT=3000
INNGEST_PORT=8288
HEALTH_URL="http://localhost:${APP_PORT}/api/health"
INNGEST_HEALTH_URL="http://localhost:${INNGEST_PORT}"

NEXT_SERVER_PID=""
INNGEST_DEV_PID=""
# Guardamos se fomos nós que demos "docker compose up" no Postgres: se ele já
# estava rodando (comum no dia a dia, já que é leve e outros comandos locais
# reusam), não é nossa responsabilidade derrubá-lo no cleanup.
POSTGRES_WAS_RUNNING="false"

# Cores só para o resumo final ficar legível no terminal.
COLOR_RED="\033[0;31m"
COLOR_GREEN="\033[0;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_RESET="\033[0m"

SUMMARY_LINES=()
OVERALL_EXIT_CODE=0

log() {
  echo -e "[test-everything] $*"
}

add_summary() {
  # $1 = status ("OK" | "FALHOU" | "PULADO"), $2 = descrição
  local status="$1"
  local desc="$2"
  local color="${COLOR_YELLOW}"
  if [ "$status" = "OK" ]; then
    color="${COLOR_GREEN}"
  elif [ "$status" = "FALHOU" ]; then
    color="${COLOR_RED}"
  fi
  SUMMARY_LINES+=("${color}[${status}]${COLOR_RESET} ${desc}")
}

# --- Cleanup ---------------------------------------------------------------
# Garante que não sobra processo órfão ocupando as portas 3000/8288 mesmo se
# o script falhar/for interrompido no meio (Ctrl+C, etapa com erro sob
# `set -e`, etc).
cleanup() {
  log "Limpando recursos..."

  if [ -n "${INNGEST_DEV_PID}" ] && kill -0 "${INNGEST_DEV_PID}" 2>/dev/null; then
    log "Encerrando Inngest dev server (grupo de processos ${INNGEST_DEV_PID})..."
    # Lançado via `setsid`, então o PID do setsid É o PGID do grupo inteiro
    # (setsid + "npx inngest-cli" + processo real do dev server) — matamos
    # o grupo todo, não só o PID raiz.
    kill -- "-${INNGEST_DEV_PID}" 2>/dev/null || true
    wait "${INNGEST_DEV_PID}" 2>/dev/null || true
  fi

  if [ -n "${NEXT_SERVER_PID}" ] && kill -0 "${NEXT_SERVER_PID}" 2>/dev/null; then
    log "Encerrando servidor Next.js (grupo de processos ${NEXT_SERVER_PID})..."
    # Mesmo raciocínio: "npm run start" (-> "next start") cria processos
    # filhos (sh -c, depois o "next-server" real). Lançamos com `setsid`
    # para isolar num grupo de processos próprio e matamos o grupo inteiro
    # de uma vez, em vez de só o PID do "npm" raiz (que deixaria o
    # "next-server" real órfão — mesmo problema que o ci.yml documenta e
    # resolve da mesma forma, só que lá via PGID da shell do step em vez de
    # `setsid`, porque lá o kill roda num step/processo separado).
    kill -- "-${NEXT_SERVER_PID}" 2>/dev/null || true
    wait "${NEXT_SERVER_PID}" 2>/dev/null || true
  fi

  # Decisão: o Postgres do docker-compose é leve e outros comandos locais
  # (npm run dev, db:studio, etc.) se beneficiam dele continuar rodando entre
  # execuções — só derrubamos se fomos nós que subimos agora E ele não
  # estava rodando antes desta execução.
  if [ "${POSTGRES_WAS_RUNNING}" = "false" ]; then
    log "Postgres foi iniciado por este script e será mantido rodando para reuso local (não derrubado automaticamente)."
  fi

  log "Cleanup concluído."
}
trap cleanup EXIT

fail_step() {
  log "${COLOR_RED}ERRO:${COLOR_RESET} $*"
  add_summary "FALHOU" "$*"
  OVERALL_EXIT_CODE=1
}

# --- 0. Verifica porta livre antes de tentar subir o app -------------------
check_port_free() {
  local port="$1"
  local label="$2"
  if ss -tln 2>/dev/null | grep -q ":${port} "; then
    log "${COLOR_RED}Porta ${port} (${label}) já está em uso.${COLOR_RESET} Libere-a antes de rodar este script (ex.: 'ss -tlnp | grep ${port}' para achar o processo)."
    exit 1
  fi
}

log "Verificando se as portas necessárias (${APP_PORT}, ${INNGEST_PORT}) estão livres..."
check_port_free "${APP_PORT}" "Next.js"
check_port_free "${INNGEST_PORT}" "Inngest dev server"

# --- 1. Docker + Postgres ---------------------------------------------------
if ! docker info > /dev/null 2>&1; then
  log "${COLOR_RED}Docker não está disponível/rodando.${COLOR_RESET} Suba o Docker antes de rodar este script."
  exit 1
fi

if docker compose -f "${REPO_ROOT}/docker-compose.yml" ps postgres --format '{{.State}}' 2>/dev/null | grep -q "running"; then
  POSTGRES_WAS_RUNNING="true"
  log "Postgres já estava rodando — reusando."
else
  log "Subindo Postgres (docker compose up -d postgres)..."
  docker compose -f "${REPO_ROOT}/docker-compose.yml" up -d postgres
fi

log "Esperando Postgres ficar healthy..."
PG_READY="false"
for _ in $(seq 1 30); do
  if docker compose -f "${REPO_ROOT}/docker-compose.yml" exec -T postgres pg_isready -U postgres -d ai_podcast_clipper > /dev/null 2>&1; then
    PG_READY="true"
    break
  fi
  sleep 2
done

if [ "${PG_READY}" != "true" ]; then
  fail_step "Postgres não ficou pronto a tempo (pg_isready nunca passou)."
  exit 1
fi
log "Postgres pronto."
add_summary "OK" "Postgres disponível (localhost:5432)"

# --- 2. Prisma generate + migrate deploy -----------------------------------
log "Rodando prisma generate..."
if ! DATABASE_URL="${DATABASE_URL_TEST}" npx prisma generate; then
  fail_step "Prisma generate falhou."
  exit 1
fi

log "Rodando prisma migrate deploy..."
if DATABASE_URL="${DATABASE_URL_TEST}" npx prisma migrate deploy; then
  add_summary "OK" "Prisma generate + migrate deploy"
else
  # P3005 ("database schema is not empty") acontece quando o Postgres local
  # já tem as tabelas (ex.: criadas via `npm run db:push` num fluxo de dev
  # anterior) mas nunca rodou `migrate deploy`, então falta a tabela de
  # histórico `_prisma_migrations`. Isso é esperado no Postgres de
  # desenvolvimento persistente (docker-compose.yml) — diferente do Postgres
  # efêmero da CI, que começa sempre vazio.
  #
  # Antes de "baselinar" (marcar as migrations existentes como já aplicadas),
  # confirmamos que não há DRIFT real entre o banco atual e o schema.prisma
  # (`migrate diff` deve resultar numa migration vazia) — só então é seguro
  # assumir que marcar como aplicado não vai mascarar uma divergência real.
  # Isso não é destrutivo: não altera dados nem schema, só cria/popula a
  # tabela de histórico `_prisma_migrations`.
  log "migrate deploy falhou — verificando se é o caso conhecido de schema pré-existente sem baseline (P3005)..."
  DIFF_OUTPUT="$(npx prisma migrate diff \
    --from-url "${DATABASE_URL_TEST}" \
    --to-schema-datamodel prisma/schema.prisma \
    --script 2>&1 || true)"

  if echo "${DIFF_OUTPUT}" | grep -q "This is an empty migration"; then
    log "Sem drift entre o banco e prisma/schema.prisma — baselinando migrations existentes (prisma migrate resolve --applied) em vez de recriar o banco."
    BASELINE_OK="true"
    for migration_dir in prisma/migrations/*/; do
      migration_name="$(basename "${migration_dir}")"
      log "  -> marcando como aplicada: ${migration_name}"
      if ! DATABASE_URL="${DATABASE_URL_TEST}" npx prisma migrate resolve --applied "${migration_name}"; then
        BASELINE_OK="false"
        break
      fi
    done

    if [ "${BASELINE_OK}" = "true" ] && DATABASE_URL="${DATABASE_URL_TEST}" npx prisma migrate deploy; then
      add_summary "OK" "Prisma generate + migrate deploy (com baseline de migrations pré-existentes)"
    else
      fail_step "Baseline de migrations (prisma migrate resolve --applied) falhou."
      exit 1
    fi
  else
    log "--- prisma migrate diff ---"
    echo "${DIFF_OUTPUT}"
    fail_step "Prisma migrate deploy falhou com drift real entre o banco e prisma/schema.prisma (não é só falta de baseline) — requer investigação manual, não é seguro automatizar."
    exit 1
  fi
fi

# --- 3. Testes unitários -----------------------------------------------------
# Não dependem de banco/app/Inngest (usam mocks, ex.:
# tests/mocks/in-memory-unit-of-work.ts). Se falharem, não tem sentido gastar
# tempo com integração/carga — abortamos aqui. O Postgres já subido é leve e
# fica de pé (ver decisão documentada no cleanup()), então não há nada caro
# para "desfazer" neste ponto além do próprio banco, que mantemos.
log "Rodando testes unitários (npm run test)..."
if npm run test; then
  add_summary "OK" "Testes unitários (npm run test)"
else
  fail_step "Testes unitários falharam (npm run test). Abortando antes de integração/carga."
  exit 1
fi

# --- 4. Build + start do app com env vars fake/dummy ------------------------
# Mesmo conjunto de env vars fake usadas pelo step "Build Next.js app and
# start server in background" do .github/workflows/ci.yml — não são segredos
# reais, servem só para o Next conseguir subir sem credenciais verdadeiras de
# Clerk/Stripe/AWS/S3.
#
# Diferença importante em relação ao ci.yml: aqui setamos explicitamente
# STRIPE_WEBHOOK_SECRET=whsec_test_secret (em vez de whsec_mock). Motivo: os
# cenários de k6 (load-tests/helpers/stripe-signature.js,
# load-tests/scenarios/main-suite.js) assinam o payload do webhook usando
# "whsec_test_secret" como default quando STRIPE_WEBHOOK_SECRET não é passado
# via --env. Para o smoke de carga do webhook do Stripe fazer sentido (em vez
# de falhar 100% das vezes com 400 de assinatura inválida), o segredo do lado
# do servidor precisa casar com o default do k6.
log "Buildando app (npm run build)..."
export SKIP_ENV_VALIDATION="1"
export DATABASE_URL="${DATABASE_URL_TEST}"
export BASE_URL="http://localhost:${APP_PORT}"
export AWS_ACCESS_KEY_ID="mock_key"
export AWS_SECRET_ACCESS_KEY="mock_secret"
export AWS_REGION="us-east-1"
export S3_BUCKET_NAME="mock-bucket"
export PROCESS_VIDEO_ENDPOINT="https://mock.modal.run/process_video"
export PROCESS_VIDEO_ENDPOINT_AUTH="mock-auth-token"
export STRIPE_SECRET_KEY="sk_test_mock"
export STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY="price_starter_monthly_mock"
export STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL="price_starter_annual_mock"
export STRIPE_PRICE_ID_PLAN_PRO_MONTHLY="price_pro_monthly_mock"
export STRIPE_PRICE_ID_PLAN_PRO_ANNUAL="price_pro_annual_mock"
export STRIPE_SMALL_CREDIT_PACK="price_small_123"
export STRIPE_MEDIUM_CREDIT_PACK="price_med_456"
export STRIPE_LARGE_CREDIT_PACK="price_large_789"
export STRIPE_WEBHOOK_SECRET="whsec_test_secret"
export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_mock"
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_Y2xlcmsuYWNjb3VudHMuZGV2JA"
export CLERK_SECRET_KEY="sk_test_YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw"
export CLERK_WEBHOOK_SECRET="whsec_mock_clerk"

if ! npm run build; then
  fail_step "Build do Next.js (npm run build) falhou."
  exit 1
fi
add_summary "OK" "Build do Next.js"

log "Subindo app em background (npm run start)..."
# `setsid` cria um grupo de processos novo para esta árvore (npm -> sh -c ->
# next-server real); guardamos o PID do `setsid` (== PGID do grupo) para
# poder encerrar a árvore inteira no cleanup sem afetar a shell deste
# script nem o processo do Inngest dev server.
setsid npm run start > "${SCRIPT_DIR}/next-server.log" 2>&1 &
NEXT_SERVER_PID=$!

log "Esperando app responder em ${HEALTH_URL}..."
APP_READY="false"
for i in $(seq 1 30); do
  if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
    log "App respondeu em /api/health após ${i} tentativa(s)."
    APP_READY="true"
    break
  fi
  sleep 2
done

if [ "${APP_READY}" != "true" ]; then
  log "--- next-server.log ---"
  cat "${SCRIPT_DIR}/next-server.log" 2>/dev/null || true
  fail_step "App Next.js não respondeu em /api/health dentro do tempo esperado."
  exit 1
fi
add_summary "OK" "App Next.js de pé (localhost:${APP_PORT})"

# --- 5. Inngest dev server ---------------------------------------------------
# O Inngest dev server não expõe um healthcheck HTTP simples e estável (a UI
# em / é uma SPA, não um endpoint JSON dedicado) — por isso usamos um
# polling leve em "a porta já responde algo" com fallback de sleep curto, e
# documentamos a limitação aqui em vez de inventar um endpoint que não existe.
log "Subindo Inngest dev server em background (npm run inngest-dev)..."
setsid npm run inngest-dev > "${SCRIPT_DIR}/inngest-dev.log" 2>&1 &
INNGEST_DEV_PID=$!

INNGEST_READY="false"
for i in $(seq 1 20); do
  if curl -sf "${INNGEST_HEALTH_URL}" > /dev/null 2>&1; then
    log "Inngest dev server respondeu após ${i} tentativa(s)."
    INNGEST_READY="true"
    break
  fi
  sleep 2
done

if [ "${INNGEST_READY}" != "true" ]; then
  log "--- inngest-dev.log ---"
  cat "${SCRIPT_DIR}/inngest-dev.log" 2>/dev/null || true
  fail_step "Inngest dev server não respondeu dentro do tempo esperado."
  exit 1
fi
add_summary "OK" "Inngest dev server de pé (localhost:${INNGEST_PORT})"

# Dá um tempo extra para o dev server terminar de sincronizar (descobrir as
# funções registradas em /api/inngest) antes de bater o webhook do Stripe —
# a sincronização inicial é assíncrona e não tem um sinal de "pronto"
# exposto via HTTP simples.
sleep 3

# --- 6. Testes de integração --------------------------------------------------
# Só test:integration (não test:all): os unitários já rodaram no passo 3, e
# rodar de novo aqui só repetiria trabalho sem valor adicional.
log "Rodando testes de integração (npm run test:integration)..."
if DATABASE_URL="${DATABASE_URL_TEST}" npm run test:integration; then
  add_summary "OK" "Testes de integração (npm run test:integration)"
else
  fail_step "Testes de integração falharam (npm run test:integration)."
fi

# --- 7. Smoke de carga (k6) --------------------------------------------------
# Só smoke (não "load" nem "stress"): esses dois são pesados (rampas de até
# 30/200 VUs por minutos) e não fazem sentido no dia a dia de "rodar tudo
# antes de considerar a tarefa pronta". Quem quiser carga pesada roda
# manualmente: npm run test:load / npm run test:load:stress / etc.
log "Rodando smoke de carga (npm run test:load:smoke)..."
if npm run test:load:smoke; then
  add_summary "OK" "Smoke de carga (npm run test:load:smoke)"
else
  fail_step "Smoke de carga falhou (npm run test:load:smoke)."
fi

# --- Resumo final -------------------------------------------------------------
echo ""
log "===================== RESUMO ====================="
for line in "${SUMMARY_LINES[@]}"; do
  echo -e "  ${line}"
done
log "===================================================="

exit "${OVERALL_EXIT_CODE}"
