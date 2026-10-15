#!/usr/bin/env bash
# Limpa o cache do Cloudflare depois do deploy, para o código novo aparecer na hora.
#
# Variáveis:
#   CLOUDFLARE_API_TOKEN  (obrigatória) token com permissão "Cache Purge" na zona
#   CLOUDFLARE_ZONE_ID    (obrigatória) id da zona tenkitermodas.com.br
#   PURGE_ALVO            (opcional)    "tudo" (padrão) ou lista de URLs separadas por vírgula
set -euo pipefail

API="https://api.cloudflare.com/client/v4"
: "${CLOUDFLARE_API_TOKEN:?defina CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ZONE_ID:?defina CLOUDFLARE_ZONE_ID}"
PURGE_ALVO="${PURGE_ALVO:-tudo}"

if [ "$PURGE_ALVO" = "tudo" ]; then
  corpo='{"purge_everything":true}'
  echo "==> Limpando TODO o cache da zona $CLOUDFLARE_ZONE_ID"
else
  urls="$(printf '%s' "$PURGE_ALVO" | python3 -c 'import json,sys; print(json.dumps([u.strip() for u in sys.stdin.read().split(",") if u.strip()]))')"
  corpo="{\"files\":$urls}"
  echo "==> Limpando URLs específicas: $PURGE_ALVO"
fi

resposta="$(curl -sS -X POST "$API/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$corpo")"

sucesso="$(printf '%s' "$resposta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("success",False))' 2>/dev/null || echo False)"
if [ "$sucesso" != "True" ]; then
  echo "::error::Falha ao limpar o cache do Cloudflare."
  printf '%s' "$resposta" | head -c 2000
  exit 1
fi

echo "PURGE_OK"
