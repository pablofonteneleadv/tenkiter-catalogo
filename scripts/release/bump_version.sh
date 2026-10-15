#!/usr/bin/env bash
# Sobe a versão do site (semver), atualiza VERSION/version.json e abre uma entrada no CHANGELOG.
#
# Uso:
#   bash scripts/release/bump_version.sh patch|minor|major ["descrição da mudança"]
#
# Exemplo:
#   bash scripts/release/bump_version.sh minor "Pipeline de CI/CD e deploy verificado"
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

TIPO="${1:-patch}"
DESCRICAO="${2:-Mudanças diversas}"
DATA="$(date -u +%Y-%m-%d)"

case "$TIPO" in
  patch|minor|major) ;;
  *) echo "Uso: $0 patch|minor|major [descrição]" >&2; exit 2 ;;
esac

ATUAL="$(cat VERSION 2>/dev/null | tr -d '[:space:]' || echo '0.0.0')"
IFS='.' read -r MA MI PA <<< "$ATUAL"
MA="${MA:-0}"; MI="${MI:-0}"; PA="${PA:-0}"

case "$TIPO" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch) PA=$((PA + 1)) ;;
esac

NOVA="$MA.$MI.$PA"
printf '%s\n' "$NOVA" > VERSION

python3 - "$NOVA" <<'PY'
import json, sys, datetime
versao = sys.argv[1]
try:
    d = json.load(open("version.json", encoding="utf-8"))
except Exception:
    d = {}
d["versao"] = versao
d.setdefault("commit", "")
d.setdefault("branch", "main")
d["publicado_em"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(d, open("version.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open("version.json", "a", encoding="utf-8").write("\n")
PY

# Insere a nova versão logo abaixo do cabeçalho do CHANGELOG.
python3 - "$NOVA" "$DATA" "$DESCRICAO" <<'PY'
import sys
versao, data, descricao = sys.argv[1], sys.argv[2], sys.argv[3]
texto = open("CHANGELOG.md", encoding="utf-8").read()
marcador = "<!-- novas versões entram logo abaixo desta linha -->"
entrada = f"{marcador}\n\n## [{versao}] - {data}\n\n- {descricao}\n"
if marcador in texto:
    texto = texto.replace(marcador, entrada, 1)
else:
    texto = texto.rstrip() + f"\n\n## [{versao}] - {data}\n\n- {descricao}\n"
open("CHANGELOG.md", "w", encoding="utf-8").write(texto)
PY

echo "Versão: $ATUAL -> $NOVA ($TIPO)"
echo "Próximo passo: git add VERSION version.json CHANGELOG.md && git commit -m \"chore(release): v$NOVA\" && git tag v$NOVA && git push --follow-tags"
