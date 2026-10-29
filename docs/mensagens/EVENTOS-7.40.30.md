# Atualização por eventos — 7.40.30

O painel recebe um sinal assim que uma mensagem é gravada, antes de concluir o download de anexos. O sinal pede a consulta autenticada já existente; não transporta nomes, mensagens, números, notas ou credenciais. Busca, rascunho e foco são preservados.

## Implementação

- Durable Object SQLite por canal, WebSocket com hibernação e sequência persistente. Migração aditiva `mensagens-eventos-v1`; nenhum dado existente é migrado ou apagado.
- Ticket emitido somente após sessão e ACL `acessar`, restrito às origens do painel. Prazo de conexão de 30 segundos, autorização de até 5 minutos e renovação em 4 minutos. Nonce de uso único persistido no objeto; sobrevive à hibernação. Token apenas em memória/subprotocolo, fora da URL e do armazenamento do navegador.
- Página oculta suspende conexões/timers; retomada sincroniza imediatamente. Reconexão com recuo e descarte de callbacks de outra conta. Eventos simultâneos são agrupados; evento durante consulta provoca nova consulta ao concluir.
- Reconciliação por consulta a cada 30 segundos com os canais conectados; falha de conexão mantém a consulta anterior de 4 segundos. A indisponibilidade do binding não interrompe recebimento ou consulta.
- Complementos de mídia e contexto atualizam mensagem, cursor de atualização e conversa na mesma transação. A conversa já aberta recebe o enriquecimento, inclusive quando o status de entrega não mudou. Cópias de mídia são reutilizadas após rollback.
- Entrada do Worker separada para exportar a classe; fixtures Node existentes continuam importando o núcleo sem dependência de `cloudflare:workers`.

## Verificação

Testes locais sem serviços reais: Worker completo no Miniflare/workerd, sessão/ACL, origem, assinatura, ticket expirado/reutilizado, canais isolados, RPC, ping, sequência após hibernação e retirada de socket expirado pelo alarme. O adaptador Node do Miniflare não entrega o evento `close` remoto nesse cenário; a expiração foi conferida nos sockets ativos do próprio objeto. Cliente simulado cobre renovação, conta trocada durante consulta, socket antigo, recuo e parada.

Jornada integrada em 320×700, 390×844, 412×915, 1440×900 e 390×470, texto 100/130%: evento em menos de 1,8 s na simulação, busca/foco/rascunho preservados, enriquecimento sem duplicar bolha e fallback com WebSocket indisponível. Layout conserva as barras e a área útil anteriores. Skill TENKiTER: **APROVADO COM LIMITAÇÃO**, sem homologação em Android físico nem envio real.

O APK atual tem caixa nativa com consulta própria de 4 segundos; este lote atualiza o painel web e as telas web do app. Não alegar que a caixa nativa já usa o socket: essa integração exige novo APK e sua validação específica. Não houve novo APK ou Apps Script neste lote.

## Publicação e restauração

Publicação pelo PR, CI verde e `deploy.yml`. Conferir versão/commit público e os três Workers ao terminar. Nova namespace é aditiva; rollback do código não deve excluir a classe/migração já criada. Manter a declaração/export da classe mesmo se desativar o cliente de eventos. A entrada R2 da versão anterior deve continuar consumida. Não restaurar banco por cima do movimento posterior.

Backup anterior: branch `backup/pre-eventos-20261029`, fonte `71798f15d9a720e6d8d359fa9260e23b59fa93ec`, arquivo completo no Cofre, SHA-256 `f727628b8293ff8f08ba579cb34da2896030e09c9548edae3d454bdd4fe0bb4f`. Não há backup permanente novo de dados neste lote; o bookmark D1 anterior depende da retenção do provedor.

CI, merge e deploy: registrar a confirmação após a execução.
