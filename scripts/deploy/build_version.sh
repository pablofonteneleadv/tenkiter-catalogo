#!/usr/bin/env bash
# Gera uma distribuição explícita sem modificar os arquivos-fonte do checkout.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
python3 scripts/deploy/prepare_public.py
python3 scripts/deploy/write_version.py "$RAIZ/.public-site/version.json"
TK_BUILD_ROOT="$RAIZ/.public-site" python3 scripts/deploy/cache_bust.py
if [ -n "${RENDER_GIT_COMMIT:-}" ]; then
  (cd "$RAIZ/.public-site" && python3 "$RAIZ/scripts/deploy/resolver_android_manifesto.py")
fi
