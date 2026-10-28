# Voltar após abrir uma notificação — site 7.40.18 / APK 2.4.3

## Problema reproduzido

A conversa salva era exibida enquanto a atualização de `/msg/mensagens` aguardava a rede. A seta mudava somente a vista, mantendo a abertura pendente e o estado de conversa em cache. A resposta tardia passava pelo controle de abertura e tornava a conversa visível novamente; a sincronização também podia tentar reabri-la. O teste novo falha no código anterior com “resposta atrasada reabriu a conversa”.

## Correção pontual solicitada

Ao voltar, invalida a abertura pendente, limpa a seleção/cache da conversa e mostra a lista imediatamente. O mesmo encerramento atende à seta e ao histórico do Android. Respostas da sincronização que pertencem à navegação anterior também são ignoradas. Toques repetidos não fecham a lista principal; outra conversa pode ser aberta normalmente. Uma resposta atrasada não marca como lida uma conversa que o usuário já deixou.

Não modifica assinatura, manifesto, código nativo ou versão instalada do APK. É uma correção nova da tela compartilhada usada pelo aplicativo 2.4.3; não reaplica as mudanças anteriores canceladas pelo proprietário. Uma página que já estava carregada deve ser reaberta uma vez para carregar o JavaScript publicado.

## Validação e UX

Tarefa: entrar pelo aviso e retornar à lista em um toque, inclusive com a rede aguardando. Skill TENKiTER aplicada.

- `tests/app_notificacao_voltar.py`: ponte de notificação real do aplicativo em navegador, cache local real, rede deliberadamente retida, seta, retorno tardio, seleção de outra pessoa, toques repetidos, Voltar do Android simulado e ausência de leitura tardia.
- Viewports 320×700, 390×844, 412×915 e 1440×900; altura reduzida a 480 e fonte 130%, tecla Enter na seta. Alvo ≥44×44px, sem rolagem horizontal e sem novo painel/controle fixo.
- `tests/app_mensagens.py`: regressão de abertura, produtos, envio simulado, compositor com teclado/altura reduzida, login guardado e Voltar do Android aprovada nas quatro viewports.
- O teste legado `mensagens_atendimento.py` está impedido pelo seletor de filtro “Nos 2 WhatsApp”, já removido da versão base antes desta correção. Não se reintroduziu esse filtro como efeito do teste.
- Evidências com dados fictícios: [lista após voltar](voltar-notificacao/lista-390.png), [altura reduzida e texto ampliado](voltar-notificacao/lista-480-texto130.png).

**APROVADO COM LIMITAÇÃO:** validação com navegador/ponte simulada, sem aparelho Android físico ou envio de notificações reais. A integração nativa continua passando o mesmo identificador para a mesma ponte; o comportamento de leitura da ação Espiar não foi alterado nesta correção.
