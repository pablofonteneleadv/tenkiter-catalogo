#!/usr/bin/env bash
# Compatibilidade com chamadas existentes. Não corta vídeo implicitamente.
set -euo pipefail
exec python3 "$(dirname "$0")/transcode.py" "$@"
