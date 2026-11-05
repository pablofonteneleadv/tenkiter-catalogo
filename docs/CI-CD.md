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
        ├─ 4. Render invalida seu próprio CDN; sem purge de zona externa
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

Os runners de backend localizam a versão mais recente por ordem numérica diretamente
no Cofre privado, sem copiar `.gs.txt` para o checkout público. Use `TK_COFRE_DIR`
para um caminho personalizado; os diretórios irmãos `Tenkiter-cofre` e `tenkiter-cofre`
são reconhecidos. Nenhum token deve ser escrito nos comandos ou logs.

```bash
TK_COFRE_DIR=/workspace/Tenkiter-cofre python3 tests/rodar_tudo.py \
  --suite backend_gs.js --suite backend_contas.js --suite backend_func.js \
  --require-backends --json-report tests/saida/backend.json
```

Sem `--suite`, o runner continua executando a bateria integral (somente sob pedido
explícito). `--list` lista sem executar. O resumo JSON separa `passed`, `failed` e
`skipped`, guarda o código de saída e a duração de cada execução. Dependência ausente
retorna 2. Backend ausente é omissão visível; `--require-backends` torna essa omissão
bloqueante. O ambiente de CI público não ganha acesso ao Cofre automaticamente.

`scripts/ci/inventario_testes.py` distingue registro no runner, chamada em workflow,
auxiliar conhecido e arquivo que precisa de classificação. Arquivo não registrado
não é contado automaticamente como uma suíte nem como cobertura aprovada.

### Distribuição estática e versão

`build_version.sh` prepara `.public-site/` a partir da lista explícita
`public-files.json`, gera o manifesto com SHA completo válido e faz cache-busting
somente na saída. Os arquivos-fonte não são reescritos pelo build. Arquivo estático
novo deve ser incluído conscientemente na lista. O diretório inclui
`android/latest.json`, não o código Android ou suas chaves.

Antes do deploy, `render_garantir_build.sh` confirma por leitura o `buildCommand` e
`serviceDetails.publishPath` efetivos no Render. O blueprint usa
`staticPublishPath: .public-site`. Se a API não confirmar a configuração, o deploy
para; não pode publicar a raiz como alternativa silenciosa.

O contrato público mínimo de `action=list` está em `schemas/catalogo-list.schema.json`:
lista vazia é válida, campos adicionais são compatíveis e ID, Nome, Preco e Status
são obrigatórios. `contrato_catalogo.py --live` só faz GET de versão e lista; nunca
grava planilhas, envia mensagens ou roda em PR. A conferência agendada depende de
acesso ao backend real e não substitui testes com serviços simulados.

### Recuperação e limpeza de branches

O workflow existente `limpar-branches.yml` só recebe nomes/SHAs da lista aprovada,
confere a ponta atual, recusa branches protegidas e registra a referência removida.
Antes de executar uma limpeza, preservar o objeto em backup recuperável fora do
ambiente temporário. A recriação usa `git push origin <sha>:refs/heads/<nome>`, desde
que esse objeto tenha sido preservado. Nenhuma limpeza foi executada pela auditoria.

### Capacidade de Fotos IA

Não há capacidade diária fixa demonstrada. Ela depende do provedor, modelo, plano
e cota da conta. O Worker trata cota esgotada como espera e distingue plano sem
imagens; isso não garante conclusão em prazo fixo. Conferir os limites no provedor
e registrar a data da consulta. Testes locais devem simular cota/falha, sem consumir
IA paga para medir capacidade.

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
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Custom Token | Conta → **Workers Scripts: Edit**, para os Workers existentes |
| `CLOUDFLARE_ZONE_ID` | Não é necessário no deploy atual | Sem zona própria aplicável identificada; não inventar valor |
| `CLOUDFLARE_ACCOUNT_ID` | `GET /accounts` (ou a URL do painel) | — |

> Workers usam conta e token, sem exigência de zona DNS ou Cache Purge. O DNS
> é externo e o CDN do site é administrado pelo Render. Purge manual permanece
> como ferramenta para uma eventual zona própria aplicável, fora do deploy atual.

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
| Cache/headers do site | Render; purge de zona própria fora do fluxo atual | Sem purge automático |
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
        ├──► deploy      (Render + invalidação do CDN pelo provedor)
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

### Cabeçalhos efetivos da origem

`render_headers.py` confere as regras via API e acrescenta somente as ausentes: nosniff, SAMEORIGIN, referrer-policy, HSTS sem incluir subdomínios e no-store nos dois manifestos. Regras desconhecidas são preservadas; conflito de valor interrompe antes das escritas. Não impõe Permissions-Policy por API. O blueprint conserva câmera/microfone na própria origem para não bloquear recursos existentes; o endurecimento adicional depende de teste da matriz de mídia.

### Conferência pública e arquivos de trabalho (7.53.5)

O site continua sendo empacotado pela lista explícita de arquivos públicos. Como
conferências posteriores ao deploy 7.53.4 ainda encontraram respostas antigas de
arquivos retirados, o deploy também cria, de forma aditiva, redirecionamentos de
URLs internas para um endereço inexistente. Não altera rotas de produtos, feeds,
páginas ou Android e não sobrescreve regras conflitantes. A confirmação exige
404/410 após redirecionamentos, tanto no domínio da loja quanto no Render; um
200 com página de erro também reprova. Se o provedor conservar arquivos apesar
das regras, o deploy fica reprovado nessa conferência e exige investigação.

`cloudflare_purge.sh` mantém sua interface e agora valida o identificador da zona
antes de qualquer chamada. Identificador incompleto não pode ser reconstruído
por tentativa. A limpeza malsucedida fica explicitamente registrada como falha
da etapa; o workflow continua para conferir a publicação real. Disponibilidade,
commit e ausência de arquivos internos têm verificações próprias obrigatórias.
Não confundir publicação comprovada com limpeza de cache comprovada.

O workflow **Saúde pública (somente leitura)** consulta página inicial,
`version.json`, `pedido.js` e `sitemap.xml`, sem sessão nem operações comerciais.
Usa o `SITE_URL` de `common.js`, limita tempo/tamanho de resposta e guarda apenas
status/duração por sete dias. Aceita sitemap vazio. A agenda é de cinco em cinco
minutos; GitHub Actions pode atrasar ou suspender agendas conforme suas regras,
portanto não representa SLA nem substitui monitor externo independente. Falhas
aparecem no Actions; destinatário/canal de alerta ainda depende da escolha do
proprietário. Não comprova autenticação, pagamentos, WhatsApp ou aparelho Android.

Para diagnóstico somente leitura com as credenciais existentes, executar o
workflow Deploy com `motivo=diagnostico-distribuicao`. Esse modo não publica nem
altera provedores. Os demais motivos mantêm o portão de CI antes de publicar.

### Leitura do Worker OG (7.54.1)

O Worker de compartilhamento/feeds recusa falha HTTP do catálogo mesmo quando
o corpo contém um objeto parecido com sucesso. Essas falhas seguem as respostas
já existentes (503 no feed, 502 na lista; sitemap preserva páginas fixas).
Consultas simultâneas no mesmo isolate compartilham apenas o fetch em andamento;
a referência é descartada no sucesso e no erro. Não há TTL novo, armazenamento
adicional ou alteração da validade do KV/cache HTTP. O tratamento da atualização
em segundo plano também observa rejeição quando não recebe waitUntil.

Os 73 checks de compartilhamento/feeds/lista, antes presentes na bateria do
runner, passam também a rodar no CI rápido, junto das regressões de falha HTTP,
concorrência, recuperação e KV. O monitor público confere CSV e XML além dos
quatro recursos anteriores; aceita feed vazio e rejeita HTML no lugar de feed,
cabeçalho inválido, CSV truncado ou XML fora do contrato. Continua somente GET,
sem autenticação, compras, WhatsApp ou escrita de dados.

### Conta dos Workers e zona DNS (7.54.4)

Os três Workers deste projeto publicam em workers.dev, sem routes/zone_id nos
wrangler.toml. Sua pré-checagem exige token ativo e acesso à conta de Workers;
CLOUDFLARE_ZONE_ID deixa de ser requisito dessa publicação. Desde7.54.5, o purge
não é executado automaticamente: não há zona própria aplicável identificada. A
ferramenta manual continua validando zona e sucesso explícito da API. HTTP200 com success=false não é
aceito como credencial válida. O diagnóstico somente leitura consulta a conta
e mostra apenas os Workers esperados, sem imprimir IDs/tokens ou outros projetos.

Decisão do proprietário: estoque permanece opcional; vazio/null/ausente não
vira zero, quantidade fictícia ou indisponibilidade. Contrato registrado em
estoque_opcional.js, sem alterar a interface nem a política de cadastro.

### Diagnóstico Cloudflare recebido em05/11 e correção7.54.5

O relatório externo, preservado no Cofre, confirmou Registro.br DNS, site Render com CDN de terceiro e três Workers na conta esperada. Nenhuma zona própria ficou visível. O deploy deixa de chamar purge e a recuperação Android repete sua verificação12vezes sem depender de Cloudflare. Falha persistente continua reprovando a publicação. O resumo separa resultados do site, Workers, Android e purge não executado. DNS, tokens, bindings, TTLs operacionais e dados são preservados.

O HIT/Age observado junto de no-store em version.json é uma inconsistência de cabeçalhos, sem conteúdo antigo comprovado. Não justifica adivinhar regras ou alterar DNS; a prova de commit e de manifesto permanece obrigatória. Regras internas do CDN Render e expiração do token exato permanecem limites de diagnóstico, sem nova pergunta indispensável ao proprietário para este reparo.
