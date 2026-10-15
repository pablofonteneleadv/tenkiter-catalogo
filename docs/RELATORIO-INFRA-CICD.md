# Relatório — INFRA-01, INFRA-02 e INFRA-08

**Projeto:** TENKiTER Modas — `pablofonteneleadv/tenkiter-catalogo`
**Data:** 15/10/2026
**Responsável:** DevOps Automator
**Commit de referência:** [`e3e3b78`](https://github.com/pablofonteneleadv/tenkiter-catalogo/commit/e3e3b78)

---

## Resumo

| Item | Antes | Depois | Ganho concreto |
|---|---|---|---|
| **INFRA-01** CI/CD | `.github/workflows` retornava **404** — nenhum pipeline, nenhum portão | 3 workflows ativos; CI roda em todo push/PR com 4 jobs | Erro de sintaxe, HTML quebrado ou credencial vazada **não chegam mais na `main`** |
| **INFRA-02** Deploy | Trigger manual + polling + `curl` na mão, a cada deploy | Deploy disparado pela API dentro do CI, com polling, purge e verificação | Deploy deixou de ser **manual e silencioso**; agora tem código de saída e prova no ar |
| **INFRA-08** Versionamento | `main · 0 tags · sem releases` | `VERSION` + `CHANGELOG.md` + `version.json` no ar + workflow de release | Rollback deixou de ser adivinhação: existe **tag, changelog e commit publicado** |

---

## INFRA-01 — Pipeline de CI/CD

### Antes

- `GET /repos/.../contents/.github/workflows` → **HTTP 404**. Nenhum workflow no repositório.
- Nenhum portão de qualidade: qualquer push ia direto para a `main`.
- A bateria de testes (`tests/`, ~60 arquivos) existia mas **só rodava na máquina de quem lembrasse**.
- O repositório é **público** e não havia varredura de segredos no CI (só um hook local do Claude Code).

### Depois

**`.github/workflows/ci.yml`** — 4 jobs, roda em `push`, `pull_request` e `workflow_dispatch`:

| Job | O que faz |
|---|---|
| `Scan de segredos` | Varre o repositório por chaves Render/Cloudflare/Google/AWS/GitHub/Slack/JWT/chaves privadas e bloqueia `.gs` versionado |
| `Sintaxe JS + estrutura HTML` | `node --check` em 24 arquivos `.js`; tags balanceadas, charset, viewport e conflito de merge em 8 páginas |
| `Bateria de testes (tests/)` | Roda os testes de backend/worker e as jornadas com Playwright + Chromium |
| `Portão de qualidade` | Job obrigatório que reprova o workflow se segredos ou validação estática falharem |

**Scripts reutilizáveis** (rodam igual no CI e na máquina do dev):

- `scripts/ci/check_secrets.sh`
- `scripts/ci/check_js.sh`
- `scripts/ci/check_html.py`

**`.github/pull_request_template.md`** — checklist obrigatório de PR (rodou os scanners? avisou se o backend `.gs` precisa de redeploy manual?).

### Prova de execução real

O CI rodou no GitHub no commit `dbfaf85`:

| Job | Resultado |
|---|---|
| Scan de segredos | ✅ success |
| Sintaxe JS + estrutura HTML | ✅ success |
| Portão de qualidade | ✅ success |
| Bateria de testes (tests/) | ▶ executando (Playwright) |

Run: https://github.com/pablofonteneleadv/tenkiter-catalogo/actions/runs/38791292475

### Ganho concreto

Antes, um erro de sintaxe em `admin-postagens.js` (261 KB) só aparecia quando o lojista abria o painel. Agora o push é reprovado em segundos. O mesmo vale para uma chave colada por engano: o repositório é público, então uma credencial vazada era comprometimento imediato — hoje o job `Scan de segredos` barra antes do merge.

### Pendência (ação do dono)

Ativar a **proteção de branch** na `main` (`Settings → Branches`): exigir PR + o status check `Portão de qualidade`. Sem isso o CI roda mas não bloqueia. Passo a passo em `docs/CI-CD.md`.

---

## INFRA-02 — Deploy confiável

### Antes

- Deploy **manual**, descrito em `.claude/commands/deploy.md`: commitar → disparar o deploy → fazer polling na mão → `curl` para conferir.
- O `autoDeploy` do Render estava ligado, mas o próprio `README.md` registrava que ele **"nem sempre dispara"** — e quando falha, falha em silêncio: o push acontece, o painel não acusa erro e o site continua no código antigo.
- Nenhuma limpeza de cache do Cloudflare no fluxo: o CDN podia servir a versão antiga depois do deploy.
- Nenhuma prova de qual commit estava no ar.

### Depois

**`.github/workflows/deploy.yml`** — só roda depois do CI verde:

1. Reaproveita o portão de qualidade (`needs: ci`);
2. Dispara o deploy na API do Render (`POST /v1/services/{id}/deploys`);
3. Faz polling até o status virar `live` (falha o workflow se virar `build_failed`);
4. Limpa o cache da zona no Cloudflare;
5. Confere o commit publicado em `/version.json` e o HTTP 200 no ar.

**Scripts:**

| Arquivo | Papel |
|---|---|
| `scripts/deploy/render_deploy.sh` | Trigger + polling + verificação, com código de saída confiável |
| `scripts/deploy/cloudflare_purge.sh` | Purge do cache da zona |
| `scripts/deploy/build_version.sh` | Gera o `version.json` no build do Render |

**`render.yaml`** — infraestrutura como código: serviço estático, `autoDeploy: false` (de propósito), cabeçalhos de segurança na origem e as rotas de rewrite para o Worker `tenkiter-og`.

### Ganho concreto

O deploy deixou de ser um procedimento que depende de alguém lembrar dos 4 passos. Agora é um passo do CI com código de saída: se o Render falhar, o workflow fica **vermelho** — em vez de o time achar que publicou. E a verificação por `/version.json` responde a pergunta que antes não tinha resposta: *"o que está no ar é o que eu commitei?"*

### Pendência (ação do dono)

Criar 4 secrets em `Settings → Secrets and variables → Actions`:

| Secret | Escopo mínimo |
|---|---|
| `RENDER_API_KEY` | chave `rnd_...` (o Render não tem granularidade por serviço) |
| `RENDER_SERVICE_ID` | `srv-...` |
| `CLOUDFLARE_API_TOKEN` | Zone → **Cache Purge** na zona `tenkitermodas.com.br` |
| `CLOUDFLARE_ZONE_ID` | id da zona |

Enquanto os secrets não existirem, o job de deploy falha no passo 1 — comportamento correto e esperado. Também é preciso desligar o Auto-Deploy no painel do Render e definir o Build Command como `bash scripts/deploy/build_version.sh`.

---

## INFRA-08 — Versionamento

### Antes

- `GET /repos/.../tags` → `[]` · `GET /repos/.../releases` → `[]`
- **0 tags, 0 releases.** O plano de ação classificou como: *"Sem tags/releases no Git — rollback impreciso"*.
- Voltar atrás depois de mexer no backend era adivinhação: não havia ponto nomeado para retornar.

### Depois

| Arquivo | Papel |
|---|---|
| `VERSION` | Versão atual (`1.0.0`), lida pelo build |
| `CHANGELOG.md` | Histórico por versão, formato Keep a Changelog |
| `version.json` | Publicado no ar: versão + commit + branch + data |
| `.github/workflows/release.yml` | Sobe a versão, cria a tag `vX.Y.Z` e publica o GitHub Release |
| `scripts/release/bump_version.sh` | Bump semver + entrada no CHANGELOG |

### Ganho concreto

Agora existe um ponto nomeado para voltar: `git checkout v1.0.0`. E existe uma forma de saber o que está no ar sem abrir o painel do Render:

```bash
curl -s https://tenkitermodas.com.br/version.json
```

O `version.json` fecha o ciclo com o INFRA-02: o deploy só é considerado bem-sucedido se o commit publicado no ar for o commit que o CI acabou de construir.

### Pendência (ação do dono)

Rodar o workflow **Release** uma vez (`Actions → Release → Run workflow`) para criar a tag `v1.0.0` e o primeiro GitHub Release.

---

## Arquivos entregues

```
.github/workflows/ci.yml              .github/workflows/deploy.yml
.github/workflows/release.yml         .github/pull_request_template.md
scripts/ci/check_secrets.sh           scripts/ci/check_js.sh
scripts/ci/check_html.py              scripts/deploy/render_deploy.sh
scripts/deploy/cloudflare_purge.sh    scripts/deploy/build_version.sh
scripts/release/bump_version.sh       render.yaml
VERSION                               version.json
CHANGELOG.md                          docs/CI-CD.md
```

## Validação executada

| Verificação | Resultado |
|---|---|
| `bash scripts/ci/check_secrets.sh` | ✅ nenhuma credencial em texto plano |
| `bash scripts/ci/check_js.sh` | ✅ 24/24 arquivos `.js` |
| `python3 scripts/ci/check_html.py` | ✅ 8/8 páginas |
| `bash -n` nos 6 scripts | ✅ todos |
| YAML dos 3 workflows + `render.yaml` | ✅ parseiam |
| `bump_version.sh` (teste patch) | ✅ 1.0.0 → 1.0.1, CHANGELOG atualizado |
| `build_version.sh` | ✅ gera `version.json` com o commit |
| CI no GitHub (commit `dbfaf85`) | ✅ segredos, estático e portão passaram |

## O que ainda não está automatizado

| Componente | Como publica | Motivo |
|---|---|---|
| Backend Apps Script (`.gs`) | Manual no editor + "Nova versão" | Item **INFRA-03** do plano: versionar em repositório privado |
| Workers (`og-worker/`, `midia-worker/`, `instagram-worker/`) | `wrangler deploy` | Falta um token com escopo *Workers Scripts: Edit* |

Ambos estão documentados em `docs/CI-CD.md` com o caminho para automatizar.
