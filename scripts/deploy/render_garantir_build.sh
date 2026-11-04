#!/usr/bin/env bash
# A confirmação inclui o diretório público; falha bloqueia o deploy.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 "$RAIZ/scripts/deploy/render_config.py"
