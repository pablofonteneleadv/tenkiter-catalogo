#!/usr/bin/env bash
# Deploy confiável no Render: dispara, acompanha até "live" e confirma no ar.
#
# Substitui o fluxo manual (trigger + polling + curl na mão) por um passo único,
# determinístico e com código de saída confiável — é o que o CI usa.
#
# Variáveis:
#   RENDER_API_KEY     (obrigatória) chave rnd_... do Render
#   RENDER_SERVICE_ID  (obrigatória) ex.: srv-dasa63fpn0mc73fh8fgg
#   SITE_URL           (opcional)    padrão https://tenkitermodas.com.br/
#   COMMIT_ESPERADO    (opcional)    SHA que deve aparecer no ar (o CI passa o github.sha)
#   TIMEOUT_SEGUNDOS   (opcional)    padrão 900
set -euo pipefail

API="https://api.render.com/v1"
: "${RENDER_API_KEY:?defina RENDER_API_KEY}"
: "${RENDER_SERVICE_ID:?defina RENDER_SERVICE_ID}"
SITE_URL="${SITE_URL:-https://tenkitermodas.com.br/}"
TIMEOUT_SEGUNDOS="${TIMEOUT_SEGUNDOS:-900}"

api() {
  local metodo="$1" caminho="$2" corpo="${3:-}"
  if [ -n "$corpo" ]; then
    curl -sS -X "$metodo" "$API$caminho" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$corpo"
  else
    curl -sS -X "$metodo" "$API$caminho" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Accept: application/json"
  fi
}

echo "==> 1/4 Disparando o deploy do serviço $RENDER_SERVICE_ID"
resposta="$(api POST "/services/$RENDER_SERVICE_ID/deploys" '{"clearCache":"do_not_clear"}')"
deploy_id="$(printf '%s' "$resposta" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id",""))' 2>/dev/null || true)"

if [ -z "$deploy_id" ]; then
  echo "::error::O Render não devolveu um id de deploy. Resposta: $resposta"
  exit 1
fi
echo "    deploy id: $deploy_id"

echo "==> 2/4 Acompanhando até ficar 'live' (limite ${TIMEOUT_SEGUNDOS}s)"
inicio="$(date +%s)"
status=""
while :; do
  agora="$(date +%s)"
  if [ $((agora - inicio)) -gt "$TIMEOUT_SEGUNDOS" ]; then
    echo "::error::Tempo esgotado esperando o deploy $deploy_id (último status: $status)"
    exit 1
  fi

  corpo="$(api GET "/services/$RENDER_SERVICE_ID/deploys/$deploy_id")"
  status="$(printf '%s' "$corpo" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status",""))' 2>/dev/null || echo '')"
  echo "    status: ${status:-?}"

  case "$status" in
    live) echo "    deploy no ar."; break ;;
    build_failed|update_failed|canceled|pre_deploy_failed)
      echo "::error::Deploy $deploy_id terminou como '$status'."
      printf '%s' "$corpo" | head -c 2000
      exit 1 ;;
  esac
  sleep 15
done

echo "==> 3/4 Confirmando que o ar está servindo o código novo"
# O painel do Render dizer "live" não é prova suficiente: o CDN pode estar com cache antigo.
for tentativa in 1 2 3 4 5 6; do
  codigo="$(curl -sS -o /dev/null -w '%{http_code}' -m 30 "$SITE_URL" || echo 000)"
  if [ "$codigo" = "200" ]; then break; fi
  echo "    tentativa $tentativa: HTTP $codigo — aguardando 10s"
  sleep 10
done
if [ "$codigo" != "200" ]; then
  echo "::error::$SITE_URL respondeu HTTP $codigo depois do deploy."
  exit 1
fi
echo "    $SITE_URL -> HTTP 200"

if [ -n "${COMMIT_ESPERADO:-}" ]; then
  echo "==> 4/4 Conferindo o commit publicado em /version.json"
  for tentativa in 1 2 3 4 5 6; do
    publicado="$(curl -sS -m 20 "$SITE_URL"version.json 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",""))' 2>/dev/null || echo '')"
    if [ "$publicado" = "$COMMIT_ESPERADO" ]; then
      echo "    commit no ar: $publicado (confere)"
      break
    fi
    echo "    tentativa $tentativa: no ar '$publicado', esperado '$COMMIT_ESPERADO' — aguardando 10s"
    sleep 10
  done
  if [ "$publicado" != "$COMMIT_ESPERADO" ]; then
    echo "::warning::O commit no ar ($publicado) não confere com o esperado ($COMMIT_ESPERADO)."
    echo "           Se o buildCommand do Render ainda não gera o version.json, configure-o (ver docs/CI-CD.md)."
  fi
else
  echo "==> 4/4 Sem COMMIT_ESPERADO — verificação por /version.json pulada."
fi

echo ""
echo "DEPLOY_OK deploy_id=$deploy_id status=$status url=$SITE_URL"
