# Revisão estética — paridade do atendimento Android 2.2

Tarefa humana: selecionar uma ou várias conversas e encerrar com motivo, sem perder o contexto; acessar as funções do atendimento completo pela lista nativa. Referência anterior: captura fornecida 1002049174.jpg e [2.1](android-atendimento-2.1.md).

Skill `.agents/skills/tenkiter-estetica-humana/SKILL.md`, checklist e fontes relidos antes da aprovação. Superfícies simples, preto quente/laranja, hierarquia por texto e proximidade; ferramentas administrativas ficam sob demanda, sem deslocar as conversas.

## Evidências e jornada

- Lista longa fictícia: [320×700](android-paridade-2.2/inbox-320.png), [390×844](android-paridade-2.2/inbox-390.png), [412×915](android-paridade-2.2/inbox-412.png), [1440×900](android-paridade-2.2/inbox-1440.png).
- [Seleção/Encerrar](android-paridade-2.2/selection-native.png), [Espiar](android-paridade-2.2/peek-native.png), [texto 130%/altura reduzida](android-paridade-2.2/inbox-large-text-empty-keyboard.png).
- [Produtos](android-paridade-2.2/products-native.png), [busca focada/altura útil 480](android-paridade-2.2/products-keyboard-native.png), [configurações](android-paridade-2.2/settings-native.png), [contatos](android-paridade-2.2/contacts-native.png).
- Exportação: [320](android-paridade-2.2/export-320.png), [390](android-paridade-2.2/export-390.png), [412](android-paridade-2.2/export-412.png), [1440](android-paridade-2.2/export-1440.png). [Painel](android-paridade-2.2/dashboard-native.png), [gráfico/ações ao fim](android-paridade-2.2/dashboard-hours-native.png).
- [Escolha de prévia no compositor](android-paridade-2.2/conversation-link-preview.png), visível somente com link no WhatsApp.
- 38 testes Android API35 com gráficos nativos: MotionEvent DOWN/espera/UP em texto e botão Espiar; não abre conversa nem confirma leitura, marca a seleção e disponibiliza Encerrar. Atualização durante o toque não cancela gesto. Botão Selecionar e ações do lote operam os IDs selecionados.
- Produtos/links/rascunho, prévia por canal, cópia/relatório por páginas com progresso e parada, limpeza separada com confirmação e cópia/relatório prévios, configurações e exportação com confirmação, painel por período/canal, relatório de contatos somente leitura e revogação de sessão. Datas inválidas mantêm o formulário, erro de conexão mantém caminho de nova tentativa. Testes sem envios/alterações reais.

## Correções e medidas

O defeito era o evento de toque longo ficar apenas na ListView, enquanto o botão filho consumia o gesto. Linha, conteúdo, avatar e Espiar agora têm tratamento próprio. Selecionar também é visível: a ação não depende só do gesto. A atualização de dados aguarda soltar o toque, e mudanças apenas de status não recriam as linhas.

Cabeçalho 52dp, busca 56dp, faixas 2×52dp. Ao selecionar, as faixas dão lugar à barra de lote de 104dp, mantendo a posição da lista. Guia/Selecionar 48dp; ações críticas >=48dp; células >=96dp. Filtros têm rolagem horizontal deliberada, corpo não. Formulários administrativos em ScrollView; produtos com área flexível para teclado. Nome/preview truncam quando necessário; status e não lidas têm texto além de cor. Controles padrão mantêm foco Android e ordem sequencial, sem nova interação obrigatória somente por cor ou gesto.

**APROVADO COM LIMITAÇÃO.** Lint Release sem erros; 38 testes passaram. Validação gráfica e interações são simuladas: 1440 é Android ampliado, teclado representado por foco/altura reduzida. Não houve teste físico de IME, TalkBack, instalação/atualização, gravação/codecs/visualizadores, seletor de compartilhamento ou entrega/ações de notificação com app fechado. Essas limitações não são apresentadas como teste real concluído.
