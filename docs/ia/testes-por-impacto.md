# TENKiTER — política de testes por impacto (obrigatória para IAs)

Atualização: 08/11/2026. **Fonte executável**: `scripts/ci/testes_impacto.py`, mapa `scripts/ci/testes_impacto_manifesto.json`, CI em `.github/workflows/ci.yml`. As instruções do Cofre sobre segurança, backups e deploy prevalecem.

## Objetivo e princípio inegociável

Proteger a loja de regressões **sem executar toda a plataforma em toda PR**. O trabalho de uma IA é entender o impacto da alteração e adicionar testes suficientes, inclusive de módulos vizinhos, quando houver dúvida real. A seleção automática é uma base conservadora, **não é autorização para reduzir validação**.

- Toda PR com código: segredos, sintaxe, HTML, regras de segurança, testes do seletor e contratos estáticos.
- PR por área: testes existentes dessa área + extras quando a alteração passa por serviços compartilhados.
- Arquivo novo ou desconhecido, módulo central, workflow de **deploy/segurança**: **toda a cobertura** (fail-safe). Exceção limitada: mudanças **exclusivamente no seletor de CI e nas instruções relacionadas** executam testes do próprio seletor e smoke transversal; um arquivo de produto ou infraestrutura de segurança fora da lista reativa cobertura ampla.
- PR só com Markdown: validações estáticas/de segurança; Graphify quando sua própria documentação muda. Não iniciar dezenas de browsers.
- **Bateria completa**: execução diária agendada (00:00 Fortaleza, cron 03:00 UTC), manual por `workflow_dispatch suite=completo`, ou `CI-EXTRA: todos` / rótulo `ci:todos`. Essa bateria **não** é dispensada.
- Merge/deploy sempre depende do `Portão de qualidade` verde. Nunca force merge ou ignore job falho; o sistema de deploy preserva o controle original.

## Como a seleção funciona

O job `escopo` calcula diff **base...head** do PR. No deploy `workflow_call`, lê `HEAD^..HEAD`. Se o diff não puder ser determinado, seleciona todos os módulos. O script `testes_impacto.py planejar` grava no `GITHUB_OUTPUT` os campos `so_docs`, `suite_completa`, `graphify_alterado`, `modulos`. A justificativa aparece no **Job Summary** do GitHub.

As categorias iniciais são `catalogo`, `mensagens`, `postagens`, `esteira`, `fotoia`, `midia`, `treinamentos`, `push` e `infra`. A classificação é por arquivo/impacto e a relação exata **teste → um ou vários módulos** fica no manifesto. Dependências cruzadas são intencionais; um teste pode executar em mais de um cenário. A bateria antiga contém mais de cem arquivos de regressão; nenhum foi simplesmente apagado.

**Exemplos concretos:**

| Alteração | Cobertura automática mínima |
|---|---|
| `treinamentos.html`, `tm-verificado.js`, manual | Treinamentos (fidelidade, leitura, RH, permissões) |
| `mensagens.html`, arquivos do mensageiro | Mensagens (filas, ficha, relacionamento, agendamentos, APIs pertinentes) |
| `postagens.html` | Postagens + Mídia |
| `instagram-worker/` | Mensagens + Postagens + Esteira + Fotos IA + Mídia + Infra |
| `midia-worker/` | Mídia + Postagens + Esteira + Fotos IA + Infra |
| `common.js`, `nav.js`, `package.json`, workflow de deploy ou rotina de segurança | Todos |
| Apenas `ci.yml`, seletor/manifesto de testes, prova do seletor e respectivas instruções | CI isolado: 4 smoke de catálogo/mensagens/treinamento + estático e Graphify aplicável |
| Novo arquivo não reconhecido | Todos, até ser explicitamente classificado |
| Somente arquivos `.md` | Checagens estáticas; sem navegador desnecessário |

Os exemplos são **piso**, não teto. Se `treinamentos.html` começar a usar um recurso de mídia compartilhada, a IA deve adicionar `midia` no plano.

## Metadados de entrega não disparam a bateria (08/11/2026)

Subir o número de versão não muda o que a loja faz, então **não deve** custar a plataforma inteira. `classificar()` trata assim:

| Arquivo | Cobertura |
|---|---|
| `VERSION`, `scripts/ci/testes_impacto_manifesto.json`, `tests/rodar_tudo.py` | módulo `ci` (o seletor e o inventário validam o mapa), somado ao que o resto da PR já exigir |
| `OneSignalSDKWorker.js` (número do service worker) | `push` + `infra` (testes de instalação e do service worker) |
| `CHANGELOG.md` e demais `.md` | documentação, sem navegador |

Continuam amplos (fail-safe): `common.js`, `nav.js`, workflows, `scripts/ci/testes_impacto.py` e qualquer arquivo novo ou desconhecido. `tests/mock.py` e outros utilitários compartilhados de teste também seguem amplos de propósito: quem precisar de um ajuste só para um teste deve fazê-lo dentro do próprio teste, não no utilitário compartilhado. A PR que muda produto declara em `CI-EXTRA:` o que mais merece ser testado.

## Exceção segura para a PR que modifica o próprio seletor de testes

**Motivo:** classificar toda mudança em `ci.yml` como risco de produto dispara os ~115 testes mapeados até quando a PR apenas otimiza a maneira de escolher os testes. Era exatamente o gargalo de 15–20+ minutos observado na primeira execução da PR #389.

O `planejar` aplica um perfil `ci` **somente se TODOS os arquivos alterados** pertencerem à lista restrita `ARQUIVOS_CI_ISOLADO` em `scripts/ci/testes_impacto.py`: `.github/workflows/ci.yml`, `scripts/ci/testes_impacto.py`, `scripts/ci/testes_impacto_manifesto.json`, `tests/testes_impacto_seletor.py`, `docs/ia/testes-por-impacto.md`, `AGENTS.md` e `CLAUDE.md`. A lista precisa ser revisada em PR, nunca estendida para caminhos de produto por comodidade.

Além das verificações de todos os PRs (segredos, sintaxe, contratos, testes do seletor), o perfil executa quatro testes Node rápidos independentes: `cadastro_vinculos.js`, `catalogo_tecido.js`, `mensagens_pendentes_espiar.js` e `manual_fidelidade.js`. Não instala Chromium ou FFmpeg para esses testes. O log mostra cada comando e estabelece limite de 600 segundos **por comando** para diagnosticar travamentos.

**Portões conservados:** uma mudança simultânea em `common.js`, `nav.js`, em scripts de deploy/segurança, em arquivo desconhecido ou em produto retorna à seleção ampliada. `CI-EXTRA:` soma módulos ao perfil; `ci:todos`, `CI-EXTRA: todos`, execução completa ou agendada acionam todos. A exceção nunca cancela o portão de qualidade nem a bateria noturna.

**Exemplos para outras IAs:** `planejar --arquivos .github/workflows/ci.yml scripts/ci/testes_impacto.py` deve retornar `ci`; acrescente `common.js` e deve retornar todos. `tests/testes_impacto_seletor.py` valida essas duas regras e bloqueia regressões. Se houver dúvida real de dependência de produto, registre `CI-EXTRA: <módulos>` no corpo da PR.

## Obrigações de qualquer IA antes de abrir uma PR

1. Ler `AGENTS.md`, `CLAUDE.md`, regras do Cofre e esta política. Consultar Graphify local quando disponível; na ausência dele, usar buscas direcionadas e registrar a limitação.
2. Descrever **o que mudou**, **o que consome o código**, **qual impacto indireto pode ocorrer**, **o que é crítico**, **o que pode ser testado sem serviço real**.
3. Conferir o plano automático: `python3 scripts/ci/testes_impacto.py planejar --arquivos treinamentos.html` (trocar pelos arquivos reais). Em PR, ler o Job Summary “Plano de testes por impacto”.
4. **Forma recomendada para qualquer IA: no corpo da PR**, adicione uma linha `CI-EXTRA: mensagens,postagens` (ajustando as áreas) para ampliar sem criar rótulos. A linha `CI-EXTRA: todos` força cobertura total; o evento `edited` reavalia o plano. Se alguma categoria for desconhecida, o CI seleciona todos por segurança. Alternativamente, se os rótulos existirem no repositório, **ampliar**, usando rótulos `ci:mensagens`, `ci:postagens`, `ci:esteira`, `ci:fotoia`, `ci:catalogo`, `ci:midia`, `ci:treinamentos`, `ci:push` ou `ci:infra`. O complemento **soma** testes; jamais substitui os automáticos. Rótulos `ci:todos` executam todos.
5. Criou arquivo novo? Classificar explicitamente em `classificar()` ou atualizar o manifesto se for teste. Até isso acontecer, a política seleciona tudo. Não apagar esse fallback para “fazer ficar verde”.
6. Para mudança de interface, aplicar a skill `tenkiter-estetica-humana`: conferir 320/390/412 px, 1440 px, rolagem, botões, conteúdo, legibilidade e screenshots de jornada real. O CI simulado **não prova aparelho Android físico**.
7. Para mudança de segurança, autorização, faturamento, mensagens reais, rede, schema, cache, armazenamento ou fontes compartilhadas, amplie a cobertura e registre por quê. Se houver dúvida séria, `ci:todos`.
8. Rever falhas reais sem classificá-las como “flaky” antes de reproduzir. Corrigir causa; não enfraquecer teste, `if`, `continue-on-error` ou branch protection para ganhar tempo.
9. No corpo da PR, documentar **testes selecionados, extras por prudência, os deliberadamente dispensados e justificativa**, evidências, riscos, recuperação e limites de validação.

## Como manter o mapa e acrescentar testes

O arquivo `scripts/ci/testes_impacto_manifesto.json` contém um dicionário `tests`: caminho → lista de módulos. Todo teste novo ou renomeado que faz parte da cobertura de PR deve entrar nele, com os módulos consumidores; não é permitido “sumir” da validação. O runner verifica a existência física de todos os testes selecionados e falha quando faltar algum. As evidências `TK_EVID` e o servidor de solicitações têm seus próprios campos no manifesto.

O planejador e executor são separados:
- `python3 scripts/ci/testes_impacto.py planejar --arquivos caminho/arquivo.js` — só calcula e explica, **não toca na loja**.
- `python3 scripts/ci/testes_impacto.py executar --modulos treinamentos` — testa uma área (mocks e servidor local).
- `python3 scripts/ci/testes_impacto.py executar --modulos mensagens,postagens` — cobertura de risco cruzado.
- `python3 scripts/ci/testes_impacto.py executar --modulos todos` — execução total de testes especializados.

Testes que requerem Playwright, FFmpeg, dependências do Worker ou servidor de solicitações só preparam essas ferramentas **quando efetivamente selecionados**. Todos os testes devem continuar sem criar vendas, enviar WhatsApp, publicar Instagram ou alterar dados reais.

## Risco versus duração

**Critério de aprovação**: cobertura justificada + CI verde, não “tempo abaixo de X minutos”. A duração reduz porque o trabalho irrelevante sai do caminho, não porque se ignora segurança. Se uma área continuar com dezenas de testes, subdividir por comportamento com o mesmo princípio de dependências (sem cortar cobertura). Uma PR crítica pode legitimamente demorar mais.

Revisar periodicamente o Job Summary, tempos por módulo e os resultados da bateria noturna. Falha descoberta à noite deve gerar teste direcionado/mapeamento para as áreas culpadas, não obrigar novamente 100 testes em toda PR.

## Segurança e rollback

`backup/pre-ci-impacto-20261108` é o ponto de recuperação (se existir na ref de trabalho). Na dúvida, restaurar o workflow anterior e reabrir CI; não alterar dados do cliente. Nenhum teste desse planejamento usa credenciais privadas, nem coloca Apps Script .gs no repositório público.

**Restrição importante:** o plano é baseado em arquivos, não consegue provar sozinho que todas as dependências ocultas foram consideradas. A IA responsável precisa adicionar testes quando encontrar uso indireto; o fallback amplia cobertura quando o arquivo é desconhecido. Essas duas camadas se complementam.
