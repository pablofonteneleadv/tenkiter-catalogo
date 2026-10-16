#!/usr/bin/env bash
# Garante que o servico do Render roda o buildCommand que gera o version.json.
#
# PROBLEMA QUE ISTO RESOLVE
# -------------------------
# O /version.json publicado vinha SEMPRE com "commit": "" — mesmo depois de um
# deploy bem-sucedido (runs 38833465713 e 38837548442, 15-16/10/2026). O arquivo
# no ar era exatamente o que esta commitado no repositorio, o que prova que o
# servico NO RENDER nao executava nenhum buildCommand: o `render.yaml` do
# repositorio descreve `buildCommand: bash scripts/deploy/build_version.sh`, mas
# esse arquivo so passa a valer quando o Blueprint e aplicado ao servico. Enquanto
# isso nao acontece, o commit publicado e impossivel de conferir — e a etapa
# "4/4 Conferindo o commit publicado" do deploy vira so um warning eterno.
#
# O que este script faz: le a configuracao ATUAL do servico e, se o buildCommand
# nao for o esperado, aplica o valor correto pela API. Idempotente.
#
# IMPORTANTE: e tolerante a falha. Um problema aqui NAO pode impedir o deploy do
# site — no pior caso avisa e segue (o commit publicado continua verificavel por
# outros meios, so nao por /version.json).
#
# Variaveis:
#   RENDER_API_KEY     (obrigatoria) chave rnd_... do Render
#   RENDER_SERVICE_ID  (obrigatoria) ex.: srv-dasa63fpn0mc73fh8fgg
#   BUILD_COMMAND      (opcional)    padrao: bash scripts/deploy/build_version.sh
set -uo pipefail

API="https://api.render.com/v1"
: "${RENDER_API_KEY:?defina RENDER_API_KEY}"
: "${RENDER_SERVICE_ID:?defina RENDER_SERVICE_ID}"
BUILD_COMMAND="${BUILD_COMMAND:-bash scripts/deploy/build_version.sh}"

# Mesma higiene dos outros scripts: um \n no fim do secret quebra a URL do curl.
limpar() {
  printf '%s' "${1:-}" | tr -d '\r\n\t' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}
RENDER_API_KEY="$(limpar "$RENDER_API_KEY")"
RENDER_SERVICE_ID="$(limpar "$RENDER_SERVICE_ID")"

api_get() {
  curl -sS -m 30 -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Accept: application/json" "$API$1"
}

echo "==> Conferindo o buildCommand do servico $RENDER_SERVICE_ID"

atual="$(api_get "/services/$RENDER_SERVICE_ID" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("serviceDetails") or d).get("buildCommand") or "")' 2>/dev/null || echo "")"

if [ "$atual" = "$BUILD_COMMAND" ]; then
  echo "    buildCommand ja esta correto: $atual"
  exit 0
fi

echo "    buildCommand atual: '${atual:-<vazio>}'"
echo "    aplicando:          '$BUILD_COMMAND'"

corpo="$(BUILD_COMMAND="$BUILD_COMMAND" python3 -c 'import json,os; print(json.dumps({"buildCommand": os.environ["BUILD_COMMAND"]}))')"
resposta="$(curl -sS -m 30 -X PATCH "$API/services/$RENDER_SERVICE_ID" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$corpo" 2>/dev/null || true)"

novo="$(printf '%s' "$resposta" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("serviceDetails") or d).get("buildCommand") or "")' 2>/dev/null || echo "")"

if [ "$novo" = "$BUILD_COMMAND" ]; then
  echo "    ok buildCommand aplicado. O proximo deploy passa a gerar o version.json com o commit real."
else
  # Nao aborta o deploy: no pior caso o version.json continua vazio e o deploy
  # segue reportando o commit por outros meios.
  echo "::warning::Nao consegui aplicar o buildCommand pela API (resposta: $(printf '%s' "$resposta" | head -c 300))."
  echo "::warning::Aplique manualmente: Render -> servico -> Settings -> Build Command."
fi
