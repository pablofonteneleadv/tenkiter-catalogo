#!/usr/bin/env bash
# PreToolUse hook: bloqueia "git commit" se o diff staged tiver padrões que parecem segredo.
# Repo é público — nunca pode vazar chave/token/PIN em texto plano.
set -euo pipefail

input="$(cat)"
command=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || true)

case "$command" in
  *git\ commit*) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || true

diff="$(git diff --cached 2>/dev/null || true)"
[ -z "$diff" ] && exit 0

# Padrões comuns de segredo/credencial em texto plano.
pattern='(AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{20,})'

if printf '%s' "$diff" | grep -qE "$pattern"; then
  echo "BLOQUEADO: o diff staged parece conter uma chave/token/credencial em texto plano. Este repo é público — remova o segredo (use variável de ambiente no Render ou Propriedades do Script no Apps Script) antes de comitar." >&2
  exit 2
fi

exit 0
