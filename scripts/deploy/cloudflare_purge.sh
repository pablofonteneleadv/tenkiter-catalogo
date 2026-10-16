#!/usr/bin/env bash
# Limpa o cache do Cloudflare depois do deploy, para o codigo novo aparecer na hora.
#
# Variaveis:
#   CLOUDFLARE_API_TOKEN  (obrigatoria) token com permissao "Cache Purge" na zona
#   CLOUDFLARE_ZONE_ID    (obrigatoria) id da zona tenkitermodas.com.br
#   PURGE_ALVO            (opcional)    "tudo" (padrao) ou lista de URLs separadas por virgula
set -euo pipefail

# ---------------------------------------------------------------------------
# Higiene dos valores vindos de GitHub Secrets
# ---------------------------------------------------------------------------
# Um secret colado no painel do GitHub costuma trazer um \n (ou espaco) invisivel
# no fim. O valor passa a ser "abc\n" e o curl morre com:
#     curl: (3) URL rejected: Malformed input to a URL function
# Foi exatamente o que derrubou o deploy de 15/10/2026 e o de 16/10/2026 (run
# 38837548442) — e sempre DEPOIS de o site ja ter sido publicado no Render, o que
# fazia um deploy bem-sucedido parecer quebrado e ainda pulava a verificacao final.
#
# Retirar espacos/quebras de linha das credenciais antes de montar a URL resolve
# de forma definitiva, sem depender de o humano ter colado o valor limpo.
limpar() {
  printf '%s' "${1:-}" | tr -d '\r\n\t' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

CLOUDFLARE_API_TOKEN="$(limpar "${CLOUDFLARE_API_TOKEN:-}")"
CLOUDFLARE_ZONE_ID="$(limpar "${CLOUDFLARE_ZONE_ID:-}")"

API="https://api.cloudflare.com/client/v4"
: "${CLOUDFLARE_API_TOKEN:?defina CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ZONE_ID:?defina CLOUDFLARE_ZONE_ID}"
PURGE_ALVO="${PURGE_ALVO:-tudo}"

# Mostra so o comprimento — nunca o valor — para dar para diagnosticar sem vazar.
echo "    token: ${#CLOUDFLARE_API_TOKEN} caracteres | zona: ${#CLOUDFLARE_ZONE_ID} caracteres"

if [ "$PURGE_ALVO" = "tudo" ]; then
  corpo='{"purge_everything":true}'
  echo "==> Limpando TODO o cache da zona $CLOUDFLARE_ZONE_ID"
else
  urls="$(printf '%s' "$PURGE_ALVO" | python3 -c 'import json,sys; print(json.dumps([u.strip() for u in sys.stdin.read().split(",") if u.strip()]))')"
  corpo="{\"files\":$urls}"
  echo "==> Limpando URLs especificas: $PURGE_ALVO"
fi

# A API da Cloudflare oscila: uma tentativa que volta vazia nao significa falha.
resposta=""
sucesso="False"
for tentativa in 1 2 3 4 5; do
  resposta="$(curl -sS -m 30 -X POST "$API/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$corpo" 2>/dev/null || true)"
  sucesso="$(printf '%s' "$resposta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("success",False))' 2>/dev/null || echo False)"
  [ "$sucesso" = "True" ] && break
  echo "    tentativa $tentativa: sem sucesso, aguardando 5s"
  sleep 5
done

if [ "$sucesso" != "True" ]; then
  echo "::error::Falha ao limpar o cache do Cloudflare."
  printf '%s' "$resposta" | head -c 2000
  exit 1
fi

echo "PURGE_OK"
