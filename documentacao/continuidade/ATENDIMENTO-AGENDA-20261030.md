# Continuidade — atendimento, agendamento e acompanhamento

Checkpoint de trabalho solicitado pelo proprietário para evitar perda do workspace. **Em revisão; não declarar este lote publicado ou concluído.**

## Retomar

Clone `pablofonteneleadv/tenkiter-catalogo`, checkout `ia/atendimento-agenda-20261029`. Leia AGENTS.md, CLAUDE.md e a skill de estética. Fontes operacionais e evidências ficam no repositório privado `pablofonteneleadv/Tenkiter-cofre`. Não é necessário recuperar este workspace.

Base publicada: site **7.40.30**, main `837758cfce0acceaaaef5a110a373a037a33ab1a`, PR #304; CI 40966462543 e deploy 40967075903 concluídos. WebSocket por canal, ingresso durável R2 e cliente de eventos já publicados. Native inbox ainda consulta a cada 4 segundos. Não reimplementar esse lote.

## Ordem explícita do proprietário

Antes de retomar o relatório antigo/busca por imagem, concluir todos estes itens:

1. Esperando atendimento → Em atendimento após primeira resposta humana. Ler/espiar/assumir e bot não iniciam atendimento. Conversa encerrada que recebe resposta volta diretamente para Em atendimento. Todos/Meus nesta fila; Todos padrão ao recarregar.
2. Iniciar conversa por número WhatsApp ou @ Instagram. API oficial Instagram exige conversa iniciada pelo cliente: não inventar envio frio por @.
3. Dentro da conversa: **Agendar** → mensagem com data/hora e anexos; checkbox **Acompanhar**.
4. Acompanhar: depois de 2 horas úteis, enviar “{saudacao} amiga, passando aqui pra saber se já deu certo o seu, fiquei aguardando sua resposta 🧡”. Após mais 2 horas úteis sem resposta, encerrar por Cliente parou de responder. Mensagem final opcional nas configurações. Qualquer resposta do cliente cancela etapas pendentes, inclusive nos canais já vinculados da mesma pessoa.
5. Horário configurável, intervalos, feriados/exceções. Exemplo: liga17h, fecha18h, abre07h30 → lembrete08h30 no próximo dia aberto.
6. Painel de agendamentos pesquisável e com filtros.
7. Gestão: presença aproximada, atividade em tempo real e histórico, análises por atendente.
8. Somente depois retomar roteiro anterior (incluindo busca por imagem).

Autorização contínua para PR/merge/deploy após validação. Última instrução: priorizar SALVAR tudo no GitHub e deixar outra IA verificar/corrigir, em vez de gastar tokens. Não contornar CI. Apps Script permanece publicação manual por Pablo.

## Implementado nesta branch, ainda não publicado

### Worker

- Migração aditiva `20261029-atendimento-agenda-3`: agenda com anexos/tipos/chave idempotente/autorização, acompanhamento e autorização renovável; presença e atividade. Sem exclusão de dados antigos.
- Expediente semanal com até 3 intervalos/dia, exceções de data e feriados anteriores; soma exata de minutos úteis em Fortaleza. Defaults preservam horários antigos.
- Acompanhamento em duas etapas, uma cadeia ativa por conversa. Cancelamento junto ao INSERT de entrada na mesma transação; duplicata de webhook não cancela cadeia nova. Resposta durante envio impede armar encerramento. Ingresso recebido mas ainda pendente em R2 bloqueia decisão prematura.
- Lembrete incerto/recusado → falha para conferência, sem repetição automática e sem encerrar. Mensagem final opcional incerta → registra falha mas encerra após lembrete confirmado e silêncio; resposta concorrente continua cancelando.
- Automação Instagram limitada à janela24h; nunca usa HUMAN_AGENT como fallback de automação. Envio humano mantém comportamento anterior.
- Agenda manual aceita texto/anexo ou só anexo, valida MIME/chave/HEAD, reserva idLocal estável, limita60dias. Sem devolver chave privada ou autorização nas listagens.
- Credencial em KV privado por referência, limite61dias, renovação de sessão existente pelo GAS em intervalos7dias somente enquanto há pedidos; valida permissões atuais no envio. Revogação falha os pedidos. Nenhuma alteração do GAS necessária.
- GET `/msg/agendadas` global: busca, canal, tipo, status, minhas, período Fortaleza, cursor30itens. Cancelar etapa de acompanhamento cancela a cadeia inteira.
- Fila derivada de saída humana confirmada ou histórico de encerramento; filtros `fila=esperando|em_atendimento`, `escopo=todos|meus`. Preserva consulta de clientes antigos. Ainda revisar performance de EXISTS/contagens com dados grandes.
- POST `/msg/iniciar`: abre número normalizado sem enviar nada; Instagram somente conversa conhecida com nome/@ exato e único (limitação: nome exibido pode não conter @; melhorar mapeamento de username sem inventar API).
- POST `/msg/presenca`: heartbeat45s em tela ativa, presença120s. GET `/msg/equipe`: período até31dias, atendente, totais e paginação50. Auditoria de ações confirmadas sem conteúdo das mensagens. Implementação RECENTE: precisa testes específicos. Não prometer histórico anterior à instalação nem medir presença como trabalho efetivo.

### Web

- Agendar/Acompanhar e horário usam painel no estilo da proposta HTML; foco/Escape/voltar, rascunho, tentativa idempotente, feedback inline.
- Seletor visual foto/vídeo separado de áudio para Photo Picker Android.
- Painel de agendamentos em Mais com filtros recolhíveis, cancelamento e abrir conversa.
- Filas Esperando/Em atendimento + Todos/Meus. Default Esperando; Todos resetado na abertura/troca de fila.
- Nova conversa e Equipe e atividade no Mais. Presença é enviada apenas com tela visível. Painel de equipe atualiza pela sondagem existente.
- Ponte nativa `TKMensagensApp.ferramenta(acao,id,espiar,pedido)` com whitelist e idempotência para agenda/painel/equipe/nova conversa.

### Android

- Acesso passa a usar `/msg/acesso` e direitos atuais, sem exigir somente Admin total. 403 de ferramenta não derruba sessão inteira;401 continua revogando.
- Agendar na conversa e Agendamentos/Equipe/Nova conversa no menu usam painéis web existentes, mantendo inbox nativa e PhotoPicker/áudio.
- Tentativa de compactar canais/filtros e adicionar filas nativas. **Última rodada tem 2 testes falhando; CORRIGIR antes de merge.**
- Direitos são enviados a InboxView, ferramentas filtradas. Revisar todas ações de menu e transições ao revogar acesso.
- **Pendente importante:** filtro Meus nativo usa primeiro nome do NativeAuth, mas deve usar alias configurado do atendente (mesma fonte do backend), não adivinhar nome.
- Novo APK ainda NÃO gerado, versão permanece2.4.5/code12. Planejar2.4.6/code13 via workflow oficial; jamais usar chave local antiga. Assinatura oficial precisa permanecer a mesma (registro no Cofre).

## Testes e estado real

Passaram antes das últimas mudanças em filas/equipe:
- `node tests/expediente_acompanhamento.js`
- `node tests/worker_acompanhamento.js` (D1 SQLite real, R2/API simulados; inclui cancelamento concorrente, idempotência, mídia, janelaIG, autorização45dias; última rodada também cobre filas e final opcional incerto)
- UI `tests/agendar_acompanhar_ui.py`, `tests/expediente_config_ui.py`, `tests/agendamentos_painel_ui.py`:320/390/412/1440 e altura470, texto100/130, axeWCAGAA nos painéis visíveis, retry, rascunho, cancelamento/paginação/ACL.
- Android56testes + lint passaram após permissões/ponte inicial. Após compactação/filas: 2 falhas:
  - `NativeInboxTest.linkedChannelsMoveTogetherAndGroupsStartHidden`, linha75
  - `NativeInboxTest.inboxAtLargeTextAndKeyboardHeightKeepsActionsVisible`, linha205
  Corrigir comportamento/área útil; não apenas remover asserts.

CI ganhou os novos2testesNode/3UI. Não foi executada bateria integral. Não houve envio real WhatsApp/Instagram/push ou IA paga como teste. Não houve Android físico.

Para UI: servidor estático na raiz (ex.: `python3 -m http.server 8783`); `TK_BASE=http://localhost:8783/ python3 tests/agendar_acompanhar_ui.py`. `tests/axe.min.js` deve ser baixado pela etapa CI existente (não commitá-lo). Evidências são privadas no Cofre.

## Próximos passos concretos

1. Rodar CI deste PR e registrar resultados. Testar nova conversa/ACL/normalização/idempotência; equipe/auditoria/presença/revogação; filas web/nativo incluindo Todos default, aliasMeus, fechada→resposta, automações, grupos e busca.
2. Corrigir Android2falhas acima e validar UI nova com skill:390×844,412×915,1440×900,320 e teclado/130%. Testar a ponte por sessão/troca de usuário/notificação/voltar sem abrir duplicado.
3. Rever auditoria: best effort via waitUntil pode perder registro em indisponibilidade D1; métricas são ações registradas, não prova de todos os atos. Melhorar transação se necessário. Encerramento reabrir usa mesmo rótulo genérico e encerramento em lote registra ação semconversa (precisa granularidade). Endpoints já exigem ACL metricas.
4. Revalidar regressões dirigidas: conversas436, entrada durável, push, IG, eventosruntime Miniflare, cache/offline e assinatura.
5. Preparar backup recuperável de main30 no Cofre/branch backup, revisar migração e rollback. **NÃO reverter Worker cru para30 com tarefas novas pendentes:** runner30 desconhece tipos de acompanhamento/anexos. Rollback de UI deve manter consumidor novo, ou cancelar/drenar tarefas de maneira controlada. Não restaurar banco apagando mensagens novas.
6. Bump site/asset refs31; publicar APK via CI oficial se alterações nativas mantidas. Atualizar documentação, passar skill novamente, CIverde, merge normal sem --admin e aguardar deploy.yml. Confirmar `/version.json` e hashes/rotas. Só então declarar publicado.
7. Atualizar Cofre com CI/deploy/backup e limites. Não afirmar este checkpoint como deploy.

## Roteiro antigo preservado, depois destas prioridades

Busca por imagem; escopos próprios/equipe/todos, transferências, SLA e análises, IA de rascunho, vendas/Pix, menções, geografia, CSAT/regras/campanhas/consentimento/etiquetas genéricas/produtos relacionados.

Pesquisa já feita para busca por imagem: Cloudflare AI Search multimodal tem `@cf/qwen/qwen3-vl-embedding-2b`,1024dim/cosine, disponível via AI Search. Não inventar shape de `env.AI.run`. Usar somente imagens do catálogo; **nunca conectar bucket MIDIA inteiro** (tem ingresso privado/contatos). Consultar documentação/preços atuais; cobrança passa a iniciar01/11. Não foi criado recurso nem feito teste pago. Projeto proposto: busca sem geração/rewrite, orçamento/cotas e índice isolado.

Histórico completo Wafly continua bloqueado por API sem endpoint documentado de histórico por intervalo/ID; não fabricar histórico. Monitor preventivo de70%quota continua sem BillingRead autorizado; não inventar quota/plano nem ler segredos para contornar.
