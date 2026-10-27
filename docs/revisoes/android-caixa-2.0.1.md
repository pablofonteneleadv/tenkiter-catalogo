# Revisão estética — caixa Android 2.0.1

Tarefa: reconhecer a conversa mais recente e identificar mensagens não lidas, filtrar por canal e abrir a conversa correta.

Referência anterior: captura fornecida pelo proprietário (1002048873.jpg), sem horários nem explicação da ordem, controles altos e “1 novas”.

A skill `.agents/skills/tenkiter-estetica-humana/SKILL.md` foi lida antes da edição e da aprovação, junto aos critérios e checklist. Nova hierarquia: Conversas; busca e sincronizar; faixa Todas / Não lidas / Canal; explicação da ordem; lista. Atualização do aplicativo permanece disponível no cabeçalho.

## Evidências e jornada

- Robolectric API 35 com gráficos nativos, serviços simulados e 30 conversas fictícias: [390×844](android-caixa-2.0.1/inbox-390.png), [412×915](android-caixa-2.0.1/inbox-412.png), [320×700](android-caixa-2.0.1/inbox-320.png), [1440×900](android-caixa-2.0.1/inbox-1440.png).
- Teste funcional: lista fora de ordem recebida da API → ordenação por instante e ID → Não lidas → canal WhatsApp 2 → toque abre o ID esperado. [Filtro combinado](android-caixa-2.0.1/inbox-unread-channel.png).
- [Texto 130%, altura disponível 480 px, busca com foco e resultado vazio](android-caixa-2.0.1/inbox-large-text-empty-keyboard.png). Busca editável, foco Android visível, nenhuma ação fora da área; teclado representado por redução de altura, não IME real.
- Estados conectado, sincronizando/sem rede, vazio e conversa offline; rascunho preservado na atualização; envio permanece bloqueado offline.
- Alvos testados >=48dp; cabeçalho 52dp, faixa de filtros 48dp, busca/sync 56dp; células >=80dp. Lista inicia aproximadamente em 210dp a 390px, comparada aos cerca de 236dp anteriores (ganho aproximado de 26dp). A linha explicativa cresce sem cortar em 320px ou texto ampliado.
- Nome em negrito + texto “não lida(s)” impedem dependência exclusiva de cor. Cinza sobre branco e verde escuro mantêm contraste AA; nenhum conteúdo real no material de teste.

Resultado: **APROVADO COM LIMITAÇÃO**. Nove testes Android passam, APK release assinado, lint sem erros. Layout e toque foram simulados em Android; instalação, TalkBack, teclado e toque no aparelho físico ainda dependem de conferência real. A revisão de 1440px é do layout Android ampliado, não de uma página web. Notificações permanecem com a prévia genérica da 2.0.0; esta revisão altera a caixa de entrada.
