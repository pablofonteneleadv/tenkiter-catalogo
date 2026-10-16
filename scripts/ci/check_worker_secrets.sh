#!/usr/bin/env bash
# Pre-flight do deploy dos Workers: confere as credenciais ANTES de tentar publicar.
#
# Por que existe (regressao de 15/10/2026)
# ----------------------------------------
# O job "Publicar Workers" falhou com a mensagem cifrada do wrangler:
#   "In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN
#    environment variable for wrangler to work."
# Os secrets TINHAM sido criados (19:46-19:48), mas a run foi CRIADA as 19:37:19.
# O GitHub resolve o contexto `secrets` no momento em que a run e criada: uma run
# que ja existe NUNCA recebe um secret criado depois. O job recebeu string vazia,
# o wrangler-action nao exportou CLOUDFLARE_API_TOKEN e o deploy morreu no meio.
#
# Resultado pratico: o deploy automatico falhou, ninguem viu, o Instagram ficou
# fora do ar ate alguem rodar `wrangler deploy` a mao.
#
# Este passo falha em 1 segundo, na primeira linha, dizendo o que fazer — em vez de
# deixar o erro aparecer 40 linhas depois do log do wrangler.
#
# Uso:  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash scripts/ci/check_worker_secrets.sh
set -uo pipefail

# ---------------------------------------------------------------------------
# Higiene dos valores vindos de GitHub Secrets
# ---------------------------------------------------------------------------
# Um secret colado no painel do GitHub costuma trazer um \n (ou espaco) invisivel
# no fim. O valor vira "abc\n" e o curl morre com
#     curl: (3) URL rejected: Malformed input to a URL function
# (foi o que derrubou o purge de cache em 15/10 e 16/10/2026). Retirar espacos e
# quebras de linha das credenciais resolve, sem depender de o humano ter colado
# o valor limpo.
limpar() {
  printf '%s' "${1:-}" | tr -d '\r\n\t' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

CLOUDFLARE_API_TOKEN="$(limpar "${CLOUDFLARE_API_TOKEN:-}")"
CLOUDFLARE_ACCOUNT_ID="$(limpar "${CLOUDFLARE_ACCOUNT_ID:-}")"
CLOUDFLARE_ZONE_ID="$(limpar "${CLOUDFLARE_ZONE_ID:-}")"

falta=0
conferir() {
  local nome="$1" valor="${2:-}"
  if [ -z "$valor" ]; then
    echo "::error::O secret $nome chegou VAZIO neste job."
    falta=1
  else
    echo "  ok $nome (${#valor} caracteres)"
  fi
}

echo "==> Os secrets chegaram neste job?"
conferir CLOUDFLARE_API_TOKEN "${CLOUDFLARE_API_TOKEN:-}"
conferir CLOUDFLARE_ACCOUNT_ID "${CLOUDFLARE_ACCOUNT_ID:-}"
conferir CLOUDFLARE_ZONE_ID  "${CLOUDFLARE_ZONE_ID:-}"

if [ "$falta" -ne 0 ]; then
  cat <<'TXT'

COMO CORRIGIR
  1. GitHub -> Settings -> Secrets and variables -> Actions: crie/atualize o secret
     que apareceu como VAZIO acima.
  2. DEPOIS de criar ou alterar um secret, DISPARE O WORKFLOW DE NOVO
     (Actions -> Workers (Cloudflare) -> Run workflow).
     O GitHub resolve os secrets quando a run e criada: uma run que ja estava em
     andamento NUNCA recebe o secret novo. Foi exatamente isso que derrubou o
     primeiro deploy automatico (run 38795395138, 15/10/2026).
  3. Se o secret existe e mesmo assim chega vazio, confira se ele foi criado em
     "Secrets" (e nao em "Variables") e se o nome esta exatamente igual.

ESCOPOS NECESSARIOS do CLOUDFLARE_API_TOKEN (Custom Token)
  Conta -> Workers Scripts : Edit        (publicar os Workers)
  Zona  -> Cache Purge      : Purge      (limpar o cache no deploy do site)
  Zona  -> Zone Read                     (ler a zona)
TXT
  exit 1
fi

echo ""
echo "==> Validando o token na API da Cloudflare"
codigo="$(curl -sS -m 20 -o /tmp/tk_verify.json -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify || echo 000)"
if [ "$codigo" != "200" ]; then
  echo "::error::A API da Cloudflare recusou o token (HTTP $codigo)."
  head -c 400 /tmp/tk_verify.json 2>/dev/null; echo ""
  exit 1
fi
python3 - <<'PY'
import json
d = json.load(open('/tmp/tk_verify.json'))
print("  ok token valido. status:", (d.get('result') or {}).get('status'))
PY

echo ""
echo "==> O token enxerga os Workers da conta?"
codigo="$(curl -sS -m 25 -o /tmp/tk_conta.json -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" || echo 000)"
if [ "$codigo" != "200" ]; then
  echo "::error::O token nao consegue listar os Workers da conta (HTTP $codigo)."
  echo "::error::Falta o escopo 'Account -> Workers Scripts -> Edit'?"
  head -c 400 /tmp/tk_conta.json 2>/dev/null; echo ""
  exit 1
fi
python3 - <<'PY'
import json
d = json.load(open('/tmp/tk_conta.json'))
nomes = sorted(s.get('id', '') for s in (d.get('result') or []))
print("  ok token le a conta. Workers vistos:", ", ".join(nomes) or "(nenhum)")
PY

echo ""
echo "Credenciais do deploy dos Workers: ok."
