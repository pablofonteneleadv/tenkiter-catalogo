#!/usr/bin/env bash
# Prepara contexto; não substitui nem desativa o hook existente de segredos.
set -u
graphify_repo_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$graphify_repo_dir" ]; then
  graphify_repo_dir="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
fi
if ! python3 "$graphify_repo_dir/scripts/graphify/manage.py" session; then
  printf '%s\n' 'Graphify não pôde preparar o índice. Siga AGENTS.md e registre o limite.' >&2
fi
exit 0
