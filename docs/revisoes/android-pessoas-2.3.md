# Revisão — APK2.3, pessoas, conversa e produtos

Tarefa humana: reconhecer a pessoa pelos seus canais, saber quem falta responder, identificar a mídia respondida e inserir produtos legíveis. Referências anteriores: prints1002050672/0678/0679/0681/0683 e1002050693/0789/0792/0793 fornecidos pelo proprietário; revisão2.2 preservada.

Skill `.agents/skills/tenkiter-estetica-humana/SKILL.md`, fontes e checklist usados antes de editar e na aprovação. Problemas encontrados: pendência excluía grupos/não lidas com última direção saída; importação não indexava nomes; cabeçalho duplicado; referência null; statusReply ignorado; MIME do vídeo não vinha sem postagem; linhas de produto tinham altura fixa. Foram corrigidos no modelo e na interface.

## Evidências

- Lista longa: [320](android-pessoas-2.3/inbox-320.png), [390](android-pessoas-2.3/inbox-390.png), [412](android-pessoas-2.3/inbox-412.png), [1440](android-pessoas-2.3/inbox-1440.png).
- [Bloco de canais](android-pessoas-2.3/inbox-linked-channels.png), [conversa/contexto](android-pessoas-2.3/conversation-story-video.png), [cadastro de pessoa](android-pessoas-2.3/person-editor.png).
- [Produtos amplos](android-pessoas-2.3/products-native.png), [busca focada com altura útil480](android-pessoas-2.3/products-keyboard-native.png), [texto130%/320×480](android-pessoas-2.3/inbox-large-text-empty-keyboard.png).
- Web [320](android-pessoas-2.3/lista-320.png), [390](android-pessoas-2.3/lista-390.png), [412](android-pessoas-2.3/lista-412.png), [1440](android-pessoas-2.3/lista-1440.png), [editor390](android-pessoas-2.3/contato-390.png).

42 testes Robolectric API35/gráficos nativos: ordem dentro/entre blocos e promoção de canal antigo, grupos desmarcados, contadores/encerradas, seleção real/atualização durante toque, leitura sem resposta, toque/contato/vínculo com confirmação, rascunhos, produtos e teclado, demais funções de2.2. Jornada Playwright4viewports: ordem7/6/1/8, grupos ocultos, aba antiga ausente, nome abre editor, alteração só ao salvar e sem erros JS/rolagem horizontal.

## Medidas e decisão

Cabeçalho da lista52dp, busca56dp, filtros2×52dp. Dentro da conversa, cabeçalho global e status online saem para preservar a área útil; cabeçalho local52dp, composição mínima48dp e ferramentas48dp. Alvos críticos48dp. Bloco principal>=104dp; secundário>=72dp, recuado e com fundo distinto/sem avatar. Controles não dependem apenas de cor.

Produtos usam janela inteira e recalculam altura útil ao teclado, com busca/estoque acima e seleção abaixo; linhas WRAP_CONTENT, texto16sp, fotos até84×112dp, ações48dp. Nome em negrito, preço/código/tamanhos em linhas próprias. Não se fixa a altura do texto para caber. Conversa usa bolhas de largura variável até520dp e datas; previews são carregados quando visíveis, duas por vez, com cache limitado e sessão vigente.

**APROVADO COM LIMITAÇÃO.** Evidências e testes são simulados, com dados fictícios. Frames de vídeo/fotos de contexto no teste de tela são placeholders; o teste servidor confirma MIME/bytes com mídias falsas, não decodificação física. Android1440 é interface ampliada. IME representado por altura/foco, não teclado real. TalkBack, codecs/MediaMetadataRetriever/player, microfone, instalador e FCM fechado precisam de validação física. Contexto antigo sem identificação/mídia no provedor não é inventado nem garantido.
