# Mensagens rápidas — 7.31.0

Tarefa humana: abrir o atendimento com as últimas conversas visíveis e receber aviso de mensagem nova sem esperar o próximo cron.

## Implementação

- Webhook autenticado grava a mensagem e agenda o despachante de push com `ctx.waitUntil`. O aceite não espera pela OneSignal. O cron continua como recuperação. A elegibilidade, validação de sessão, mensagem genérica e idempotency_key continuam no despachante existente.
- App abre a caixa sem carregar listas/categorias/estatísticas do catálogo. Produtos continua funcional, com carregamento na abertura da gaveta. Lista de atendimento e resumo carregam em paralelo.
- Cache local só no modo `app=mensagens`, sob conta e sessão validadas: SHA-256 do identificador de conta/sessão (não guarda o token), até dez consultas, 60 conversas/lista e 80 mensagens/conversa, teto de 500 mil caracteres e validade de 24 horas por entrada. Não inclui anexos ou URLs de mídia.
- Conteúdo salvo é exibido como cópia de leitura. Faixa de status no fluxo, abaixo do cabeçalho, sem cobrir mensagem ou compositor. Controles de resposta ficam desativados até a confirmação do servidor. Retorno da rede revalida a conversa; logout e HTTP 401/403 apagam o cache. Respostas de sessão anterior são descartadas.

## Evidências e revisão estética

- `tests/app_mensagens.py`: quatro viewports (390×844, 412×915, 1440×900, 320×700), módulo abre sem catálogo, Produtos carrega sob demanda, resposta simulada funciona, aviso nativo e teclado reduzido não cobrem o compositor.
- `tests/app_mensagens_cache.py`: aquece cache, reabre com API de conversas indisponível (login simulado autorizado), mostra lista/conversa, bloqueia escrita, restaura rede, atualiza e limpa ao sair. Cache de outra conta/sessão é recusado. Sem erro JS nem overflow horizontal. Evidências `tests/saida/app-cache-{390,412,1440,320}.png`.
- Referência anterior: `tests/saida/app-mensagens-{390,412,1440,320}.png`. Nenhum controle administrativo extra na tela de atendimento; faixa de leitura usa 12 px/1,4 e aproximadamente 29–46 px conforme quebra de linha, no fluxo da coluna. Alvos existentes mantêm 44 px ou mais.
- Worker móvel: webhook novo dispara o despachante sem cron; duplicado não agenda novamente; entrega simulada e revogação/logout preservados. Mensagens 49 e conversa 175 verificações aprovadas. Atendimento existente: 35 verificações com axe aprovadas.

Resultado: **APROVADO COM LIMITAÇÃO**. Não medimos latência ponta a ponta em Android físico nem enviamos mensagem/notificação real como teste. A página e o login inicial ainda dependem da rede. FCM/OneSignal, provedor e Android determinam a latência final. A mudança é recebida pelo APK 1.0.0 existente, sem reinstalação.
