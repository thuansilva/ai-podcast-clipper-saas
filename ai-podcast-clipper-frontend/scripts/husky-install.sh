#!/usr/bin/env bash
#
# husky-install.sh — instala os git hooks (Husky) no `.husky/` da RAIZ do
# monorepo (um nível acima deste pacote), não dentro de
# ai-podcast-clipper-frontend/.
#
# Por quê: hooks de git são configurados por repositório inteiro (a raiz do
# git é `../` em relação a este arquivo), mas não existe `package.json` na
# raiz do monorepo — o Husky é instalado como devDependency aqui, em
# ai-podcast-clipper-frontend/package.json, que é o único package.json do
# projeto Node. Por isso não dá para usar o fluxo padrão `npx husky init`/
# `"prepare": "husky"` (que assume que o package.json já está na raiz do
# repo): precisamos apontar explicitamente o instalador do Husky para rodar
# com cwd na raiz do git, usando o `husky/bin.js` que já está instalado
# aqui dentro de node_modules/.
#
# Chamado via `npm run prepare` (script "prepare" do package.json), que o
# npm executa automaticamente depois de `npm install`.
set -euo pipefail

# Em CI (ex.: GitHub Actions roda `npm ci`) e em qualquer ambiente sem git
# (ex.: imagem de deploy a partir de um tarball, sem histórico git) não há
# hooks para instalar — pula sem erro em vez de falhar o install/build.
if [ "${CI:-}" = "true" ] || [ "${HUSKY:-}" = "0" ]; then
  echo "[husky-install] CI=true ou HUSKY=0 detectado — pulando instalação de git hooks."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v git > /dev/null 2>&1; then
  echo "[husky-install] git não encontrado no PATH — pulando instalação de git hooks."
  exit 0
fi

REPO_ROOT="$(cd "${FRONTEND_DIR}" && git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "${REPO_ROOT}" ]; then
  echo "[husky-install] Não estamos dentro de um repositório git — pulando instalação de git hooks."
  exit 0
fi

# O instalador do Husky (husky/bin.js, sem argumentos) cria `.husky/_`
# (hooks internos do Husky, que despacham para os hooks reais em
# `.husky/<nome-do-hook>`) relativos ao cwd em que é executado, e configura
# `git config core.hooksPath` de acordo. Executamos com cwd = raiz do git
# para que `.husky/` fique na raiz do monorepo, não dentro deste pacote.
cd "${REPO_ROOT}"
node "${FRONTEND_DIR}/node_modules/husky/bin.js"
echo "[husky-install] Git hooks instalados em ${REPO_ROOT}/.husky (core.hooksPath=.husky/_)."
