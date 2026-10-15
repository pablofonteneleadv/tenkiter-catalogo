# CI/CD e Deploy — TENKiTER Modas

Documentação operacional do pipeline. Cobre os itens **INFRA-01** (pipeline de CI/CD),
**INFRA-02** (deploy confiável) e **INFRA-08** (versionamento) do plano de ação.

---

## 1. Visão geral

```
   edição local
        │
        ▼
  branch + Pull Request ──► CI (ci.yml)  ──► portão de qualidade
        │                     ├─ scan de segredos
        │                     ├─ sintaxe JS + estrutura HTML
        │                     └─ bateria de testes (tests/)
        ▼
   merge na main
        │
        ▼
  Deploy (deploy.yml)
        ├─ 1. reaproveita o portão de qualidade
        ├─ 2. dispara o deploy na API do Render  (trigger explícito)
        ├─ 3. acompanha até o status "live"      (polling)
        ├─ 4. limpa o cache do Cloudflare        (purge)
        └─ 5. confirma o commit no ar            (curl /version.json)
```

Antes deste pipeline: **nenhum** workflow no GitHub (`.github/workflows` retornava 404),
deploy manual (trigger + polling + curl na mão) e **0 tags / 0 releases**.

---

## 2. INFRA-01 — Pipeline de CI/CD

### Arquivos

| Arquivo | O que faz |
|---|---|
| `.github/workflows/ci.yml` | Workflow de CI: 4 jobs (segredos, estático, testes, portão) |
| `scripts/ci/check_secrets.sh` | Varre o repositório por credenciais em texto plano |
| `scripts/ci/check_js.sh` | `node --check` em todos os `.js` do site |
| `scripts/ci/check_html.py` | Tags balanceadas, charset, viewport, conflito de merge |
| `.github/pull_request_template.md` | Checklist obrigatório de PR |

### Rodar localmente (antes de abrir o PR)

```bash
bash scripts/ci/check_secrets.sh
bash scripts/ci/check_js.sh
python3 scripts/ci/check_html.py
python3 tests/rodar_tudo.py
```

### Proteção de branch (configurar uma vez, no GitHub)

`Settings → Branches → Add branch protection rule` para `main`:

- [x] **Require a pull request before merging** (1 aprovação)
- [x] **Require status checks to pass** → selecionar `Portão de qualidade`
- [x] **Require branches to be up to date before merging**
- [x] **Do not allow bypassing the above settings**

> Sem isso o CI roda mas não bloqueia nada. É o passo que transforma o workflow em portão.

### Sobre os testes que dependem do backend

`tests/backend_gs.js`, `backend_contas.js` e `backend_func.js` leem os arquivos
`catalogo-codigo-*.gs.txt` / `funcionario-codigo-*.gs.txt`, que **não são versionados**
(o repositório é público e eles contêm a lógica do backend). No CI esses jobs rodam com
`continue-on-error: true` — eles passam a valer de verdade quando o backend for versionado
em repositório privado (item **INFRA-03** do plano). O portão obrigatório é o job `estatico`.

---

## 3. INFRA-02 — Deploy confiável

### Por que não usar o autoDeploy do Render

O `autoDeploy` depende de um webhook do GitHub para o Render. Quando ele falha, **falha em
silêncio**: o push acontece, o painel não acusa erro e o site continua no código antigo.
O próprio `README.md` e o comando `.claude/commands/deploy.md` já registravam isso.

**Decisão:** `autoDeploy: false` no `render.yaml` + deploy disparado pela API dentro do CI.
Assim o deploy tem código de saída: se falhar, o workflow fica vermelho.

### Arquivos

| Arquivo | O que faz |
|---|---|
| `.github/workflows/deploy.yml` | Orquestra o deploy pós-merge |
| `scripts/deploy/render_deploy.sh` | Trigger + polling até `live` + verificação no ar |
| `scripts/deploy/cloudflare_purge.sh` | Limpa o cache da zona no Cloudflare |
| `scripts/deploy/build_version.sh` | Gera o `version.json` no build do Render |
| `render.yaml` | Infraestrutura como código (serviço, headers, rotas) |

### Segredos necessários (GitHub → Settings → Secrets and variables → Actions)

| Secret | Onde obter | Escopo mínimo |
|---|---|---|
| `RENDER_API_KEY` | Render → Account Settings → API Keys | (a chave do Render não tem granularidade por serviço) |
| `RENDER_SERVICE_ID` | Painel do serviço, ou `GET /v1/services` | — |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Custom Token | Account → **Workers Scripts: Edit** + Zone → **Cache Purge** (na zona `tenkitermodas.com.br`) |
| `CLOUDFLARE_ZONE_ID` | Visão geral da zona, ou `GET /zones` | — |
| `CLOUDFLARE_ACCOUNT_ID` | `GET /accounts` (ou a URL do painel) | — |

> O mesmo `CLOUDFLARE_API_TOKEN` serve para o purge do cache **e** para publicar os
> Workers. Ele precisa das duas permissões: *Workers Scripts: Edit* (conta) e
> *Cache Purge* (zona). Se o token não enxergar a zona, o purge falha — ver a
> seção 5.

> **Nunca** cole esses valores no chat, em issue, em PR ou em arquivo do repositório.
> Só no cofre de segredos do GitHub (ou nas variáveis de ambiente do Render).

### Rodar o deploy manualmente (fora do CI)

```bash
export RENDER_API_KEY='rnd_...'
export RENDER_SERVICE_ID='srv-...'
export COMMIT_ESPERADO="$(git rev-parse HEAD)"
bash scripts/deploy/render_deploy.sh

export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ZONE_ID='...'
bash scripts/deploy/cloudflare_purge.sh
```

### Rollback

1. **Rápido (código):** `git revert <commit>` na `main` → o CI dispara o deploy do revert.
2. **Por tag:** `git checkout v1.0.0` → branch → PR → merge (o deploy publica a versão da tag).
3. **Pela API do Render:** `POST /v1/services/{id}/rollback` com o `deployId` anterior
   (ver `GET /v1/services/{id}/deploys`).

---

## 4. INFRA-08 — Versionamento

| Arquivo | Papel |
|---|---|
| `VERSION` | Versão atual (semver), lida pelo build |
| `CHANGELOG.md` | Histórico por versão (Keep a Changelog) |
| `version.json` | Publicado no ar: versão + commit + data (prova do que está servindo) |
| `.github/workflows/release.yml` | Cria tag + GitHub Release |
| `scripts/release/bump_version.sh` | Sobe a versão e escreve no CHANGELOG |

### Publicar uma release

GitHub → **Actions → Release → Run workflow** → escolher `patch`/`minor`/`major` e descrever
a mudança. O workflow sobe a versão, commita, cria a tag `vX.Y.Z` e publica o Release.

Ou localmente:

```bash
bash scripts/release/bump_version.sh minor "Pipeline de CI/CD e deploy verificado"
git add VERSION version.json CHANGELOG.md
git commit -m "chore(release): v1.1.0"
git tag v1.1.0 && git push --follow-tags
```

### Conferir o que está no ar

```bash
curl -s https://tenkitermodas.com.br/version.json
```

---

## 5. Workers da Cloudflare (automatizados)

| Componente | Como publica | Automatizável? |
|---|---|---|
| Site estático (Render) | `deploy.yml` → job `deploy` | ✅ sim |
| Cache/headers (Cloudflare) | `cloudflare_purge.sh` | ✅ sim |
| Workers (`og-worker/`, `midia-worker/`, `instagram-worker/`) | `deploy.yml` → job `workers` (wrangler-action) | ✅ **sim** |
| Backend Apps Script (`.gs`) | colar no editor + "Nova versão" | ❌ manual (item INFRA-03) |

### Como funciona

O job `workers` do `deploy.yml` roda **depois do CI verde** e publica os três Workers
em paralelo (matrix), um por pasta, com `cloudflare/wrangler-action@v3`. Em seguida o
job `verificar-workers` confirma pela API que os três foram republicados agora há pouco
e que o `tenkiter-og` responde.

```
   merge na main
        │
        ▼
  CI (ci.yml) ──► portão de qualidade
        │
        ├──► deploy      (Render + purge do Cloudflare)
        └──► workers     (wrangler deploy × 3, em paralelo)
                  │
                  ▼
             verificar-workers  (modified_on recente + /feed.csv 200)
```

### Configuração de cada Worker

Cada pasta tem um `wrangler.toml` versionado — é a **fonte da verdade** da configuração
(nome, bindings, vars e cron). Nenhum segredo nesses arquivos: o repositório é público.

| Pasta | Worker | Bindings | Cron |
|---|---|---|---|
| `og-worker/` | `tenkiter-og` | nenhum (só chama a API pública) | — |
| `midia-worker/` | `tenkiter-midia` | KV `CACHE`, R2 `MIDIA`, var `API_URL` | — |
| `instagram-worker/` | `tenkiter-ig` | D1 `DB`, KV `CACHE`, R2 `MIDIA`, vars `API_URL`/`MIDIA_URL` | `* * * * *` |

> Os bindings do `wrangler.toml` são os **mesmos que já estão em produção**. O wrangler
> substitui a configuração inteira do Worker pelo que está no arquivo — por isso os
> bindings precisam estar declarados aqui, senão o deploy os apagaria.

### Publicar um Worker à mão (quando precisar)

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ACCOUNT_ID='...'
npx wrangler deploy --config og-worker/wrangler.toml
```

Os antigos `publicar.py` continuam nas pastas como alternativa sem wrangler, mas o
caminho normal passou a ser o CI.

### Verificar o que está no ar

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash scripts/deploy/verificar_workers.sh
```

O script lê o `modified_on` de cada Worker na **lista** de scripts (esse campo não existe
em `/settings`) e confere que a publicação é recente. `LIMITE_SEGUNDOS` ajusta a janela
(padrão 900 s).

---

## 6. Checklist de primeiros passos

- [ ] Criar os 5 secrets no GitHub (tabela da seção 3)
- [ ] Ativar a proteção de branch na `main` (seção 2)
- [ ] No Render: desligar o Auto-Deploy do serviço e definir o Build Command como
      `bash scripts/deploy/build_version.sh`
- [ ] Rodar o workflow **Release** uma vez para criar a tag `v1.0.0`
- [ ] Fazer um PR de teste e confirmar que o portão bloqueia/libera corretamente
- [ ] **Revogar o token da Cloudflare que foi colado no chat** e criar um novo
      (o antigo vale até 01/12/2026 e está comprometido — ver o relatório de infra)

> ⚠️ **O token da Cloudflare que circulou no chat deve ser revogado.** Ele dá acesso de
> escrita aos Workers e ao cache da zona. Crie um token novo com os escopos da tabela da
> seção 3, troque o secret `CLOUDFLARE_API_TOKEN` no GitHub e só então revogue o antigo.
