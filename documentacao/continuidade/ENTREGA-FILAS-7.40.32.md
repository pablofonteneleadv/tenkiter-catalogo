# Filas de atendimento — 7.40.32

Entrega posterior à agenda7.40.31 (PR306, merge747695f, CI40998127627 e deploy40998577188 concluídos; version.json e asset público conferidos).

## Comportamento

- Faixa existente passa a mostrar Esperando, Em atendimento e Todas. Não acrescenta linha ao cabeçalho.
- Esperando: conversa individual aberta sem resposta humana confirmada e sem histórico de encerramento. Ler/espiar/assumir e mensagens automáticas não iniciam atendimento.
- Em atendimento: resposta humana confirmada ou encerramento anterior. Cliente que escreve depois de encerrado volta diretamente para esta fila.
- Em atendimento oferece seletor Todos/Meus, sempre Todos ao abrir a tela/recarregar ou trocar a fila. Meus segue o responsável e nome configurado do atendente, mesma regra atual do backend.
- Não lidas e Falta responder ficam em Filtros; são combináveis com a fila. Todas remove restrição de fila. Grupos e filtros especiais (retomar, minhas, com notas, encerradas) preservam seus critérios existentes sem restrição implícita da nova fila.
- Regra por conversa/canal, preservando os blocos de pessoa já existentes. Não migra nem apaga mensagens e não redefine responsáveis.
- Campo derivado em SQL com índices de histórico já existentes; sem nova tabela/migração. Endpoints antigos sem parâmetro fila conservam resultado anterior, incluindo APK2.4.5 nativo.

## Escopo e pendências

Aplicado na web e Atendimento completo do app atual. Interface nativa, início de conversa e gestão de equipe ainda estão no checkpoint PR305 e dependem de correções/testes. Não declarar esses itens publicados por este lote.

## Validação

436conversas; acompanhamento com teste de fila real em SQLite (bot/leitura/assumir não movem, envio incerto não move, confirmado move, Todos/Meus e histórico encerrado). UI: cinco viewports320/390/412/1440 e390×470, texto100/130%, estado de saúde, alvos44px, Todos ao reload, filtros combinados e axeAA; jornadas de clareza e saúde preservadas.

Skill estética revisada: tarefa principal localizar espera e atendimento; faixa única existente, navegação dentro dos limites, sem rolagem horizontal. APROVADO COM LIMITAÇÃO: Chromium simulado, sem Android físico ou entrega real de teste. Evidências no Cofre. CI e deploy devem ser confirmados antes de declarar publicação.

Backup anterior: backup/pre-filas-atendimento-20261030 e código31 recuperável no Cofre52. Rollback desta UI/SQL para31 é compatível; preservar runner de agendamento31 enquanto houver suas tarefas pendentes.
