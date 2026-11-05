#!/usr/bin/env bash
# Interface mantida; Workers workers.dev exigem conta/token, não zona DNS.
set -euo pipefail
python3 "$(dirname "${BASH_SOURCE[0]}")/check_worker_credentials.py"
