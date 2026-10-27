# Revisão estética — atendimento Android 2.1

Tarefa humana: reconhecer quem espera resposta, espiar sem confirmar leitura, responder com produtos/respostas/anexos e organizar atendimentos. Referências anteriores: capturas fornecidas 1002048981.jpg (painel completo) e 1002048628.jpg (notificação genérica).

Skill de estética lida antes de editar e na aprovação, junto ao checklist e fontes. A interface conserva lista local rápida e usa ferramentas nativas; o painel completo permanece no menu para recursos administrativos e histórico além do cache.

## Evidências

- Lista longa com dados fictícios: [390×844](android-atendimento-2.1/inbox-390.png), [412×915](android-atendimento-2.1/inbox-412.png), [320×700](android-atendimento-2.1/inbox-320.png), [1440×900](android-atendimento-2.1/inbox-1440.png).
- [Conversa online](android-atendimento-2.1/conversation-online-390.png), [offline a 320](android-atendimento-2.1/conversation-offline-320.png), [Espiar](android-atendimento-2.1/peek-native.png) sem campo de envio, [seleção](android-atendimento-2.1/selection-native.png).
- [Busca vazia com texto a 130% e altura útil de teclado](android-atendimento-2.1/inbox-large-text-empty-keyboard.png), [produtos](android-atendimento-2.1/products-native.png), [produtos com busca focada/altura 480px](android-atendimento-2.1/products-keyboard-native.png), [edição de resposta](android-atendimento-2.1/quick-reply-edit-native.png).
- Android API 35/Robolectric com gráficos nativos: 18 testes. Jornada Espiar → abertura normal, filtros combinados, lote com IDs selecionados, rascunho preservado, produtos e respostas inseridos sem envio, salvar resposta explicitamente, confirmação de anexo, não reenvio em sync, assinatura por canal, paginação+delta e limpeza de arquivos na troca/logout. Preços comparados com 17 fixtures geradas por common.js.
- Worker: 178 verificações de mensagens/contatos/histórico, 52 do grupo e suíte de push (nome/prévia, autor, ações, sigilo de sessão, tarefas atrasadas, mensagem apagada, deduplicação e permissão revogada), sem efeitos reais externos.

## Medições e decisão

Cabeçalho 52dp, busca 56dp, duas faixas de filtros de 52dp; controles >=48dp. Faixas possuem rolagem horizontal intencional, como o painel original, sem rolagem horizontal do corpo. Células >=96dp comportam nome, horário, prévia, telefone/canal e Espiar; textos longos abreviam com reticências. Estado de espera/unread usa texto e negrito, além de cor. Contraste escuro/verde/laranja sobre branco/fundo claro AA. Espaço de composição removido ao espiar; opções da conversa ocupam alvo de 48dp. Seleção e ferramentas aparecem sob demanda.

**APROVADO COM LIMITAÇÃO.** Nenhum fluxo simulado enviou mensagem real. 1440px é o layout Android ampliado. Teclado foi representado por redução de altura e foco, não por IME real. Som, gravação, codecs, TalkBack, instalador, ações de notificação e entrega FCM com app fechado precisam de conferência no celular. A prévia de notificação foi validada no payload do OneSignal, não por captura física do Android. Não se afirma paridade nativa das configurações administrativas: contatos/diagnósticos/métricas continuam disponíveis no atendimento completo.
