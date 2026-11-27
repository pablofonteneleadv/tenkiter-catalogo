# Área "Equipe" — plano completo até a conclusão (fonte para qualquer IA que der seguimento)

Atualizado em 27/11/2026. Dono das decisões: Pablo (proprietário). **Não invente escopo**: faça só o que está aqui, na ordem. Mudou algo? Pergunte ao Pablo e registre aqui antes de implementar.

## 1. Objetivo do negócio (por que existe)
Tirar o trabalho do **celular pessoal** das funcionárias. Toda comunicação de trabalho acontece **no app TENKiTER, no celular da loja**, com a pessoa certa logada pela troca de pessoa com PIN (app 2.6, ver `CHANGELOG.md` 7.97.0). Hoje os recados e os grupos de gestão do WhatsApp se perdem.

**Critério de projeto concluído** (todas as fases abaixo no ar, com testes verdes e checadas no ar):
1. Comunicados com "Li e entendi" individual e relatório de leitura — **feito (8.0.0)**.
2. Grupos Gestão e Geral + conversas privadas — **feito (8.0.0)**.
3. Gestão definida pelas permissões, sem lista na tela — **esta PR (8.1.0)** + publicação manual do Apps Script (passo P1).
4. Tarefas gerais e individuais — **esta PR (8.1.0)**.
5. Foto e áudio nas conversas e comunicados — **pendente (fase 5)**.
6. Foto de prova ao concluir tarefa — **pendente (fase 6)**.
7. Congelar os grupos de gestão do WhatsApp — **pendente (fase 7, depende de data do Pablo)**.

## 2. Decisões do Pablo (não mudar sem pedir)
- Construir **no nosso app**, sem ferramenta externa nem API de terceiros (Connecteam e similares descartados).
- **Gestão da Equipe vem das permissões, nunca de lista na tela.** É gestão quem tem a permissão `equipe_gestao` (RH → Acessos, grupo "Equipe") **ou** os perfis **Admin total, Admin e Responsável RH**. Gestão: publica comunicados (normais e importantes), exclui comunicados, cria e exclui tarefas, está no grupo Gestão, vê "quem leu".
- Funcionárias conversam entre si (privadas 1 a 1); o foco é a conversa de equipe, com dois grupos fixos: **Gestão** e **Geral** (Geral = toda a equipe).
- Conversa privada: ninguém de fora lê, **nem o Admin total**.
- Avisos (push) vão para o celular da loja de quem está usando, inclusive quem não usa as Mensagens. **21h–7h (Fortaleza) só o comunicado importante toca** (recomendação aceita até o Pablo dizer outra coisa).
- Pessoas da TENKiTER: a gestão é o Pablo (Admin total) e a Karla. **Bruno não é da TENKiTER** (é de outro projeto do Pablo): nunca citá-lo aqui.
- Vocabulário oficial do site: "Excluir" (não "Apagar"), "Gestão", "Tentar de novo"; ação destrutiva com `confirm()` dizendo a consequência (ver `docs/ia/padroes-site.md`).

## 3. O que já existe (mapa)
| Peça | Onde |
|---|---|
| Tela | `equipe.html` (abas Comunicados, Conversas, Tarefas). Primeira pintura com o último estado guardado da pessoa (`tk_equipe_v1:<whats>`), regra "Sem troca ao carregar". |
| Servidor | `instagram-worker/worker.js`, bloco "Área Equipe": `rotasEquipe_`, `eqEhGestao_`, `eqAvisar_`, `eqAparelho_`. Rotas `/equipe/*` e `/app/aparelho`. |
| Banco (D1) | `eq_pessoa` (whats, nome, visto, gestao), `eq_comunicado`, `eq_leitura`, `eq_msg`, `eq_lido`, `eq_tarefa`, `eq_tarefa_feita`. Aparelhos: `msg_mobile` (compartilhada com as Mensagens). |
| App Android | `Modulo.EQUIPE` / `JanelaEquipe` (`Janelas.kt`), ícone `ic_janela_equipe`, contador no painel (`Contadores.kt`, `/equipe/contagem`), toque no aviso abre a Equipe (`TenkiterApp.kt`), `ligarAvisosEquipe` liga os avisos ao trocar de pessoa e 1×/dia. |
| Permissão no Apps Script | Cofre privado: `catalogo-codigo-4.32.gs.txt` e `funcionario-codigo-3.40.gs.txt` (permissão `equipe_gestao`). |
| Testes | `tests/worker_equipe.js` (Node 24, `node:sqlite`), `tests/equipe_ui.py` (Playwright, 390 e 1440 px), `JanelasTest.kt`. Registrados em `scripts/ci/testes_impacto_manifesto.json` (módulos mensagens/infra — **não** colocar no módulo `padroes`, que tem exatamente 4 testes). |

### Rotas do servidor (todas exigem sessão; só contas da equipe)
- `GET /equipe/inicio` · `GET /equipe/contagem` (comunicados sem ler + mensagens novas + tarefas de hoje)
- `POST /equipe/comunicado` (gestão) · `POST /equipe/comunicado/apagar` (gestão) · `POST /equipe/lido` · `GET /equipe/leituras?id=` (gestão) · `POST /equipe/lembrar` (gestão)
- `GET /equipe/sala?id=|com=&depois=` · `POST /equipe/mensagem {sala|com, texto}`
- `GET /equipe/tarefas` · `POST /equipe/tarefa` (gestão) · `POST /equipe/tarefa/feita {tarefa, desfazer?}` · `POST /equipe/tarefa/apagar` (gestão)
- `/equipe/config` → 410 (aposentada: agora é pelas permissões)
- `POST /app/aparelho {subscription}` (liga os avisos do aparelho para a pessoa)

## 4. Passos manuais que só o Pablo faz
- **P1 — Publicar o Apps Script** (regra do projeto: Apps Script é publicação manual do Pablo): Catálogo `catalogo-codigo-4.32.gs.txt` e RH `funcionario-codigo-3.40.gs.txt` (no Cofre). Depois, a IA confere `?action=versao` (catálogo deve responder `catalogo-4.32` com `equipeGestao: true`; RH `3.40`). **Não declarar publicado sem conferir.** Antes de P1, o servidor já reconhece os 3 perfis pelo nome; a permissão só aparece no RH → Acessos depois de P1.
- **P2 — Primeiro uso**: Pablo abre o app 2.6.4+ com a conta dele (cadastra o WhatsApp para os alertas de PIN e entra na lista da Equipe). Karla abre a Equipe uma vez.
- **P3 — Data para congelar os grupos de gestão do WhatsApp** (fase 7). Não congelar nada sem a data dele.

## 5. Próximas fases (fazer nesta ordem, uma PR por fase)
Regras para todas: branch `ia/equipe-<assunto>-<AAAAMMDD>`; testes antes/depois (base `origin/main` × candidata, diferença zero de falhas nos vizinhos); `python scripts/ci/check_padroes.py`; skill `tenkiter-estetica-humana` (390 e 1440, toque ≥ 44 px, sem rolagem lateral); CHANGELOG + VERSION; mudança de APK sobe `versionCode`/`versionName` em `android/app/build.gradle` (nunca reaproveitar versão: o `scripts/android/release.py` recusa fonte diferente com a mesma tag); merge só com CI verde; conferir o deploy (`/version.json`).

### Fase 5 — Foto e áudio nas conversas e comunicados
- Reusar o envio de mídia que já existe no projeto (servidor de mídia `tenkiter-midia` / anexos das Mensagens): **não** criar outro armazenamento nem serviço externo. Investigar como as Mensagens fazem upload (`/msg/anexo` no Worker e `NativeTools`/`admin-mensagens.js`) e reaproveitar a mesma rota ou uma rota irmã sob `/equipe/anexo` com a mesma checagem de equipe.
- `eq_msg` e `eq_comunicado` ganham um campo opcional de anexo (tipo, chave, mime). Mostrar foto (com `atribSrc`, nunca interpolar src) e áudio com controle nativo.
- Aceite: foto e áudio enviados e vistos em Gestão, Geral e privada; privada continua inacessível a terceiros; testes no `worker_equipe.js` e `equipe_ui.py`.

### Fase 6 — Foto de prova ao concluir tarefa
- Opção "pedir foto de prova" na criação da tarefa (gestão). Ao marcar como feita, quem faz anexa a foto (mesmo envio da fase 5). A gestão vê a foto no "feita por".
- Aceite: tarefa com prova não fica "feita" sem a foto; testes nos dois arquivos de teste.

### Fase 7 — Congelar os grupos de gestão do WhatsApp (só com a data do Pablo — P3)
- Antes: exportar o histórico dos grupos (Mensagens → Gestão → Exportar conversas → Só grupos, já existe desde 7.99.0).
- Publicar na Equipe um comunicado importante avisando a mudança (texto aprovado pelo Pablo).
- Congelar (só administradores escrevem) é feito **pelo Pablo no WhatsApp**; a IA só prepara o texto e o passo a passo. Não usar API para mexer em grupos.

## 6. O que NÃO fazer
- Não reintroduzir lista de "quem publica / quem está na Gestão" na tela (a gestão vem só das permissões).
- Não ler, exportar nem mostrar conversa privada para ninguém além dos dois participantes.
- Não usar ferramenta externa, API de terceiros ou serviço pago para a Equipe.
- Não editar nem publicar Apps Script em produção (só preparar no Cofre; quem publica é o Pablo).
- Não enviar avisos reais em teste (OneSignal sempre simulado nos testes).
- Não mudar decisões da seção 2 sem pedido do Pablo; não citar Bruno.
- Não marcar fase como concluída sem: PR mesclada, deploy conferido e testes verdes.

## 7. Como testar localmente (Windows)
- Worker: `node tests/worker_equipe.js` com **Node 24** (precisa de `node:sqlite`).
- Tela: servir a raiz (`python -m http.server 8795 --bind 127.0.0.1`) e `TK_BASE=http://127.0.0.1:8795/ PYTHONUTF8=1 python tests/equipe_ui.py`. Capturas em `tests/saida/` (não commitar).
- Vizinhos para comparar base × candidata: `worker_app_pin.js`, `worker_esteira.js`, `worker_mensagens_conversa.js`, `app_troca_pessoa_ui.py`.
