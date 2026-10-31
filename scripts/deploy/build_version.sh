#!/usr/bin/env bash
# Gera o version.json publicado no ar, com o commit exato que o Render esta servindo.
# Roda como buildCommand do site estatico no Render (RENDER_GIT_COMMIT e injetado pelo Render).
# Fora do Render, cai para o git local - assim o arquivo tambem funciona em teste.
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

# Cache-busting dos assets (item 2 do plano de front). Roda DEPOIS do
# version.json para o ?v= ser sempre o VERSION deste commit. Sem isso o
# navegador serve o JS antigo e o deploy nao chega em quem ja visitou o site.
python3 scripts/deploy/cache_bust.py

# O APK é publicado/verificado antes deste build pelo workflow oficial.
if [ -n "${RENDER_GIT_COMMIT:-}" ]; then
  python3 scripts/deploy/resolver_android_manifesto.py
fi
