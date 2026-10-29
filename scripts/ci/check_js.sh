#!/usr/bin/env bash
# Verifica a sintaxe de TODOS os arquivos .js do site (raiz + workers + og-service).
# Falha (exit 1) se algum arquivo tiver erro de sintaxe.
set -uo pipefail

falhas=0
total=0

while IFS= read -r arq; do
  total=$((total + 1))
  if ! node --check "$arq" >/dev/null 2>&1; then
    echo "::error file=$arq::Erro de sintaxe em $arq"
    node --check "$arq" 2>&1 | head -5 | sed 's/^/    /'
    falhas=$((falhas + 1))
  fi
done < <(find . -name '*.js' \
  -not -path '*/node_modules/*' \
  -not -path './.git/*' \
  -not -name 'axe.min.js' \
  -not -name 'OneSignalSDKWorker.js' \
  | sort)

echo "Sintaxe: $((total - falhas))/$total arquivos .js OK"
[ "$falhas" -eq 0 ] || exit 1
