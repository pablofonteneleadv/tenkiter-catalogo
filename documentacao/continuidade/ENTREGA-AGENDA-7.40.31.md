# Entrega delimitada 7.40.31

Este lote publica somente Agendar/Acompanhar, anexos, expediente configurável e painel de agendamentos. O checkpoint completo continua no PR305/commit21e3fd8; filas, nova conversa, gestão de equipe e mudanças Android ficam para um lote posterior, com testes específicos e correção das falhas registradas. Não misturar o guia do checkpoint com escopo efetivamente publicado.

## Uso

Na conversa web/Atendimento completo do app, tocar Agendar. Mensagem permite data/hora de Fortaleza e foto/vídeo/áudio; Acompanhar arma lembrete após2horas úteis e encerramento após mais2horas úteis de silêncio. Qualquer resposta nova cancela a cadeia. O texto padrão solicitado e a mensagem final opcional ficam em Mais→Respostas automáticas, junto do expediente semanal e exceções. Mais→Agendamentos consulta, filtra, cancela e abre o cliente.

O APK nativo2.4.5 não ganha botão novo neste lote; usar sua opção Atendimento completo. Não foi gerado APK novo. Sem alteração de Apps Script.

## Integridade

Migração aditiva; mantém agenda antiga. Reserva idempotente e janelaIG24h para automação. Envio incerto do lembrete não repete e não encerra. Mensagem final opcional incerta registra falha; a cadeia só encerra após lembrete confirmado e silêncio. Resposta concorrente tem prioridade. Permissões validadas no servidor e no envio; autorização limitada a pedidos pendentes.

Rollback: reverter frontend é possível mantendo Worker novo. NÃO voltar ao runner30 enquanto houver tarefas de acompanhamento/anexos pendentes; ele desconhece seus tipos. Não restaurar banco removendo mensagens novas. Backup de código30 e checkpoint no Cofre PR51; branch backup/pre-agendar-20261030.

## Validação

D1/R2/API simulados:436verificações de conversa, ingresso durável, expediente e acompanhamento (cancelamento atômico, concorrência, anexos, idempotência, autorização futura e falhas). Agendar/configuração/painel em320/390/412/1440 e altura470,100/130%texto, axeAA, navegação/foco/rascunho/retentativa/filtros/paginação/ACL.

Skill estética: tarefa principal agendar sem perder conversa; controles44px ou mais, painel com cabeçalho/rodapé alcançáveis, sem rolagem horizontal. APROVADO COM LIMITAÇÃO: evidências em Chromium simulado; Android físico e entrega real ao destinatário não homologados. Nenhum envio real de teste ou IA paga.

CI, merge e deploy deverão ser registrados no Cofre após confirmação. Este documento preparatório não declara publicação concluída.
