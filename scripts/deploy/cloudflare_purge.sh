#!/usr/bin/env bash
# Interface preservada; falha nunca é apresentada como PURGE_OK.
set -euo pipefail
python3 "$(dirname "${BASH_SOURCE[0]}")/cloudflare_purge.py"
