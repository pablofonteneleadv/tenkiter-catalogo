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
http=""
erro_curl=""
for tentativa in 1 2 3 4 5; do
  # stderr e capturado (nao descartado): sem ele um "sem sucesso" nao diz se o
  # problema foi credencial recusada, rede ou URL malformada.
  resposta="$(curl -sS -m 30 -X POST "$API/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$corpo" \
    -w $'\n__HTTP__%{http_code}' 2>&1)" || erro_curl="$resposta"
  http="$(printf '%s' "$resposta" | sed -n 's/.*__HTTP__//p' | tail -1)"
  resposta="$(printf '%s' "$resposta" | sed 's/__HTTP__[0-9]*$//')"
  sucesso="$(printf '%s' "$resposta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("success",False))' 2>/dev/null || echo False)"
  [ "$sucesso" = "True" ] && break
  echo "    tentativa $tentativa: HTTP '${http:-sem resposta}' erro='${erro_curl:-nenhum}' corpo='$(printf '%s' "$resposta" | head -c 200)'"
  erro_curl=""
  sleep 5
done

if [ "$sucesso" != "True" ]; then
  # LIMPAR CACHE E BEST-EFFORT, NAO REQUISITO DO DEPLOY.
  #
  # O codigo novo JA esta no ar (o Render publicou e o site responde 200). O purge
  # so serve para o CDN nao continuar servindo a versao antiga por alguns minutos.
  #
  # Fazer esta etapa derrubar o job era o pior defeito do pipeline: um deploy
  # bem-sucedido ficava vermelho E a etapa seguinte ("Verificacao final no ar")
  # era pulada, entao ninguem conferia producao — foi o que aconteceu nos runs
  # 38833465713, 38837548442 e 38840046234, sempre DEPOIS de o site ja ter subido.
  #
  # Causa mais provavel medida no run 38840046234: o token responde VAZIO (sem
  # corpo e sem erro de rede), ou seja o CLOUDFLARE_API_TOKEN do repositorio tem
  # escopo de Workers e nao a permissao "Cache Purge". Enquanto o dono nao
  # acrescentar essa permissao ao token, o purge nao tem como funcionar — mas isso
  # nao pode mascarar o resultado do deploy.
  echo "::warning::Nao consegui limpar o cache do Cloudflare (HTTP '${http:-sem resposta}')."
  echo "::warning::O deploy em si esta OK (o Render publicou). Verifique o token: ele precisa da permissao de Cache Purge para a zona tenkitermodas.com.br."
  printf '%s' "$resposta" | head -c 500
  echo "PURGE_IGNORADO"
  exit 0
fi

echo "PURGE_OK"
