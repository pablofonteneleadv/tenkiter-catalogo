#!/usr/bin/env bash
# Confere, pela API da Cloudflare, que os 3 Workers foram publicados AGORA HÁ POUCO.
#
# É a prova de que o `wrangler deploy` do CI realmente chegou em produção — sem
# depender de abrir o painel e olhar a data. Se algum Worker não tiver sido
# republicado dentro da janela, o job falha.
#
# Uso:  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash scripts/deploy/verificar_workers.sh
set -uo pipefail

: "${CLOUDFLARE_API_TOKEN:?Defina CLOUDFLARE_API_TOKEN.}"
: "${CLOUDFLARE_ACCOUNT_ID:?Defina CLOUDFLARE_ACCOUNT_ID.}"

BASE="https://api.cloudflare.com/client/v4"
LIMITE="${LIMITE_SEGUNDOS:-900}"   # 15 min: o deploy acabou de rodar
TENTATIVAS="${TENTATIVAS:-4}"      # a API e a borda oscilam; insistir é mais confiável que falhar
WORKERS=(tenkiter-og tenkiter-midia tenkiter-ig)

# Busca com retentativa: devolve o corpo no stdout, ou vazio se todas falharem.
buscar() {
  local url="$1" saida=""
  for _ in $(seq 1 "$TENTATIVAS"); do
    saida="$(curl -sS -m 30 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$url" 2>/dev/null || true)"
    [ -n "$saida" ] && { printf '%s' "$saida"; return 0; }
    sleep 3
  done
  return 1
}

# A data de publicação (modified_on) NÃO existe em /settings — só na LISTA de scripts.
# Por isso uma única chamada à lista serve para os três Workers.
lista="$(buscar "$BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" || true)"
if [ -z "$lista" ]; then
  echo "::error::Não consegui falar com a API da Cloudflare (lista de Workers vazia)."
  exit 1
fi

falhas=0

for w in "${WORKERS[@]}"; do
  idade="$(printf '%s' "$lista" | W="$w" python3 -c '
import sys, json, os, datetime
alvo = os.environ["W"]
try:
    d = json.load(sys.stdin)
except Exception:
    print(-1); raise SystemExit
for s in (d.get("result") or []):
    if s.get("id") == alvo:
        mod = s.get("modified_on")
        if not mod:
            print(-1); raise SystemExit
        t = datetime.datetime.fromisoformat(mod.replace("Z", "+00:00"))
        agora = datetime.datetime.now(datetime.timezone.utc)
        print(int((agora - t).total_seconds()))
        raise SystemExit
print(-1)
' 2>/dev/null || echo -1)"

  if [ "$idade" -lt 0 ]; then
    echo "::error::Worker $w: não encontrado ou sem data de publicação."
    falhas=$((falhas + 1))
  elif [ "$idade" -gt "$LIMITE" ]; then
    echo "::error::Worker $w: última publicação há ${idade}s (limite ${LIMITE}s) — o deploy não chegou."
    falhas=$((falhas + 1))
  else
    echo "  ok $w — publicado há ${idade}s"
  fi
done

# Prova de que o Worker responde de verdade (endpoint público, sem login).
# /feed.csv é o feed que a Meta e o Google consomem: se ele responde, o Worker está vivo.
codigo=""
for _ in $(seq 1 "$TENTATIVAS"); do
  codigo="$(curl -sS -o /dev/null -w '%{http_code}' -m 40 \
    https://tenkiter-og.distkrpconfeccoes.workers.dev/feed.csv 2>/dev/null || true)"
  [ "$codigo" = "200" ] && break
  sleep 3
done
if [ "$codigo" != "200" ]; then
  echo "::error::tenkiter-og /feed.csv respondeu ${codigo:-000} (esperado 200)."
  falhas=$((falhas + 1))
else
  echo "  ok tenkiter-og /feed.csv -> 200"
fi

if [ "$falhas" -gt 0 ]; then
  echo ""
  echo "FALHOU: $falhas verificação(ões) dos Workers."
  exit 1
fi

echo ""
echo "Workers: os 3 foram publicados e o tenkiter-og responde."
