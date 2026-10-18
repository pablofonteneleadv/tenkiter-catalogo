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
        ├─ 2. publica o site                     (trigger explícito)
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
(o repositório é público e eles contêm a lógica do backend; a fonte-base é o repositório privado
`Tenkiter-cofre`). Por isso o CI **não executa** esses testes (`ci.yml` comenta isso no job de testes):
rode-os localmente, com os `.gs.txt` do cofre ao lado do código. O portão obrigatório é o job `estatico`
(mais segredos e escopo).

---

## 3. INFRA-02 — Deploy confiável

### Como o deploy é disparado

O deploy é **automático pelo GitHub**: o merge na `main` aciona o `deploy.yml`, que publica o
site, acompanha até "live" e confirma o commit em `/version.json`. É o único caminho de
publicação (não há deploy manual). Ele tem código de saída: se falhar, o workflow fica vermelho.

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

### Rollback

1. **Rápido (código):** `git revert <commit>` na `main` → o CI dispara o deploy do revert.
2. **Por tag:** `git checkout v1.0.0` → branch → PR → merge (o deploy publica a versão da tag).

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
- [ ] Rodar o workflow **Release** uma vez para criar a tag `v1.0.0`
- [ ] Fazer um PR de teste e confirmar que o portão bloqueia/libera corretamente
- [ ] **Revogar o token da Cloudflare que foi colado no chat** e criar um novo
      (o antigo vale até 01/12/2026 e está comprometido — ver o relatório de infra)

> ⚠️ **O token da Cloudflare que circulou no chat deve ser revogado.** Ele dá acesso de
> escrita aos Workers e ao cache da zona. Crie um token novo com os escopos da tabela da
> seção 3, troque o secret `CLOUDFLARE_API_TOKEN` no GitHub e só então revogue o antigo.

## 6. CI otimizado — modo rápido e bateria completa (17/10/2026)

### Objetivo

Evitar que cada merge/deploy repita a bateria de navegador e as mesmas verificações de Workers, sem abrir mão do scan de segredos, da validação estática nem de um teste funcional mínimo.

### Modos

- **PR normal:** scan de segredos + sintaxe/estrutura + testes rápidos dos Workers de mídia, Instagram e canal.
- **PR só com arquivos Markdown:** scan de segredos e estático continuam obrigatórios; testes de código são dispensados.
- **Deploy da `main`:** `deploy.yml` chama `ci.yml` como workflow reutilizável no modo rápido. O workflow não é disparado separadamente por `push` na `main`, evitando CI duplicado.
- **Bateria completa:** workflow `CI` → `Run workflow` → `suite=completo`, ou execução agendada diária. Inclui Playwright, acessibilidade, jornadas e demais suites de `tests/rodar_tudo.py`.
- **Workers Cloudflare:** publicação automática centralizada em `deploy.yml`. **Até 18/10/2026 isso estava quebrado em silêncio**: com `skip_ci: true` o job `ci` ficava *skipped* e o `publicar` (sem `always()`) também, então nenhum Worker era publicado pelo deploy; corrigido no PR #34. Depois de todo merge confira que os jobs `Publicar tenkiter-ig/midia/og` terminaram em `success`.
- **Workers Cloudflare (detalhe antigo):**  O workflow reutilizável `workers.yml` recebe `skip_ci: true` do deploy porque o commit já passou pelo portão; execução manual ainda executa seu próprio CI rápido.

### Como rodar a bateria completa manualmente

1. GitHub → **Actions** → **CI**.
2. **Run workflow**.
3. Escolher `completo` no campo `suite`.
4. Conferir o resultado de cada suite, não apenas o resumo.

A bateria completa está agendada para 03:00 UTC (00:00 em Fortaleza). Se o agendamento não for necessário, remova o bloco `schedule` de `.github/workflows/ci.yml`.

### Limites e manutenção

- O modo rápido é uma proteção de feedback curto, não prova equivalente à bateria completa. Mudanças amplas em fluxo de cliente, cadastro/admin, autenticação, acessibilidade, Apps Script ou telas devem ser avaliadas com a suíte completa antes do merge/publicação quando viável.
- O teste completo não deve ser executado uma segunda vez dentro de passos isolados que o próprio `rodar_tudo.py` já executa.
- Não adicionar `continue-on-error: true` a testes que devem bloquear publicação sem uma justificativa documentada.
- O job **Portão de qualidade** mantém o mesmo nome para preservar a configuração de proteção da branch `main`.
- A duração real deve ser medida nas primeiras execuções; os tempos dependem de instalação do Chromium, disponibilidade do runner e duração das suites.
- **Primeira execução agendada (18/10/2026): FALHOU** após ~24 min com "exit code 1" (job *Testes rápidos ou bateria completa*). O log não é baixável pelo proxy da sessão do Claude. Causa mais provável: `backend_gs.js`, `backend_contas.js` e `backend_func.js` leem o `.gs.txt` do backend, que não está no repositório — no GitHub nunca poderiam passar. Correção de 18/10/2026: `tests/rodar_tudo.py` pula esses testes quando não há `.gs.txt` (lista os pulados e emite `::warning`), passou a incluir testes novos que estavam fora da bateria e emite `::error` por teste que falha (anotações legíveis em Actions e pela API). Se a execução de 19/10 ainda falhar, o nome do teste aparece nas anotações. Falhas conhecidas de antes: `jornada_funcionaria.py` ("progresso foi enviado ao servidor"); `selecao_link.py` e `rolagem_infinita.py` (listadas como falhando na `main` em 17/10 e não revalidadas depois).
- **`ubuntu-latest` vira Ubuntu 26 em 19/10/2026** (aviso do GitHub): os workflows ficam fixados em `ubuntu-24.04` até alguém validar o Chromium/Playwright e o Python no runner novo.
