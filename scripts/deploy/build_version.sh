#!/usr/bin/env bash
# Gera o version.json publicado no ar, com o commit exato que o Render está servindo.
# Roda como buildCommand do site estático no Render (RENDER_GIT_COMMIT é injetado pelo Render).
# Fora do Render, cai para o git local — assim o arquivo também funciona em teste.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

VERSAO="$(cat VERSION 2>/dev/null | tr -d '[:space:]' || echo '0.0.0')"
COMMIT="${RENDER_GIT_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo 'desconhecido')}"
BRANCH="${RENDER_GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')}"
MOMENTO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > version.json <<JSON
{
  "versao": "$VERSAO",
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "publicado_em": "$MOMENTO",
  "servico": "tenkiter-catalogo"
}
JSON

echo "version.json gerado: versao=$VERSAO commit=$COMMIT branch=$BRANCH"
