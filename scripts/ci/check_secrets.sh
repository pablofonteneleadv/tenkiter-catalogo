#!/usr/bin/env bash
# Varre TODO o conteúdo versionado procurando credenciais em texto plano.
# O repositório é público: qualquer chave que entre aqui está comprometida.
# Sai com código 1 se encontrar algo.
set -uo pipefail

# Padrões de credencial conhecidos (Render, Cloudflare, Google, AWS, GitHub, Slack, OpenAI, chaves privadas).
PADROES=(
  'rnd_[A-Za-z0-9]{20,}'                       # Render API key
  'AIza[0-9A-Za-z_-]{30,}'                     # Google API key
  'AKIA[0-9A-Z]{16}'                           # AWS access key id
  'gh[pousr]_[0-9A-Za-z]{30,}'                 # GitHub token
  'github_pat_[0-9A-Za-z_]{30,}'               # GitHub fine-grained PAT
  'sk-[A-Za-z0-9]{20,}'                        # OpenAI / genérico
  'xox[baprs]-[0-9A-Za-z-]{10,}'               # Slack
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'         # chave privada
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'  # JWT
  'CLOUDFLARE_API_TOKEN[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9_-]{20,}'
  'RENDER_API_KEY[[:space:]]*=[[:space:]]*["'"'"']?rnd_'
  '"private_key"[[:space:]]*:[[:space:]]*"-----BEGIN'
)

# Arquivos que legitimamente contêm os padrões:
#  - o próprio scanner e a documentação (mostram os padrões como exemplo);
#  - tests/ — as baterias usam credenciais FALSAS de propósito (rnd_TESTE..., AIzaINVENTADA...)
#    para simular o comportamento do backend. Nenhuma delas é real.
EXCECOES='^(\./)?(scripts/ci/check_secrets\.sh|docs/.*|\.github/.*|CHANGELOG\.md|tests/.*)$'

falhas=0
for padrao in "${PADROES[@]}"; do
  while IFS= read -r linha; do
    [ -z "$linha" ] && continue
    arq="${linha%%:*}"
    if [[ "$arq" =~ $EXCECOES ]]; then continue; fi
    echo "::error file=$arq::Possível credencial em texto plano (padrão: ${padrao:0:24}...)"
    echo "  $linha" | cut -c1-160
    falhas=$((falhas + 1))
  done < <(git grep -nIE "$padrao" -- . 2>/dev/null || true)
done

# Backends do Apps Script nunca podem ser versionados (o .gitignore já cobre, isto é a rede de segurança).
while IFS= read -r arq; do
  [ -z "$arq" ] && continue
  echo "::error file=$arq::Backend .gs/.gs.txt versionado — não pode ir para o repositório público."
  falhas=$((falhas + 1))
done < <(git ls-files | grep -E '\.gs(\.txt)?$' || true)

if [ "$falhas" -gt 0 ]; then
  echo ""
  echo "BLOQUEADO: $falhas ocorrência(s). Use variáveis de ambiente no Render ou Propriedades do Script no Apps Script."
  exit 1
fi

echo "Segredos: nenhuma credencial em texto plano encontrada."
