# Lote de correções — site 7.40.17

Publicação autorizada explicitamente pelo proprietário em 28/10/2026, após a fase de preparação dos erros 1 a 4. Resultado do deploy será registrado após o workflow.

## Resultado preparado

- Erro 1: canal atual/atalho explícitos no código nativo, diagnóstico sem conteúdo de clientes, contexto de status do reserva preservado. Consulta real de `/device` confirmou principal no WhatsApp 1 e reserva no WhatsApp 2 (números da loja apenas no log privado). Não existe inversão de instâncias. O endpoint de configuração de recebimento consultado respondeu 404 nas duas instâncias; não se inventaram opções nem se copiaram credenciais. A confirmação da mídia em nova resposta a status do principal ainda depende de o provedor entregar a referência.
- Erro 2: janela de contato única e imediata; WhatsApp com nome/dois números/Instagram, Instagram com nome/um número. Associação por qualquer dos números, preservando o principal e segundo. Formulário compartilhado site/APK 2.4 também corrigido. Ficha do cliente continua no avatar e menu; o nome abre a edição solicitada.
- Erro 3: Produtos abre sem aguardar rede, usa o catálogo salvo e atualiza por trás. Ao digitar, abre Refinar busca com Categoria, Para quem, Tamanho e Cor; contagens e seleção preservadas. Campos e filtros locais, sem pedido ao servidor por letra. Mesmo comportamento na tela compartilhada do APK 2.4; cache persistente e filtros também preparados no código nativo.
- Erro 4: linha própria das miniaturas e oito linhas completas de informações no subgrid. Fotos extras ficam abaixo da principal e acima das informações; ações/preços continuam alinhados em cartões com/sem fotos adicionais e com textos de tamanhos diferentes.
- Instagram/Ludimara: consulta somente leitura ao provedor confirmou a mensagem e três tentativas de webhook **failed / The operation was aborted**. A conversa não existia no D1. O recebimento agora valida assinatura e persiste numa fila antes de aceitar, sem aguardar inicialização completa, consultas externas ou mídia. Falhas de gravação mantêm o evento para nova tentativa pelo cron, com bloqueio por prazo e deduplicação. A carga bruta é removida após sucesso. Não envia mensagens automáticas como efeito de recuperação. Reentrega original será solicitada após publicar o Worker, e conferida no D1.

## Compatibilidade do aplicativo

O APK publicado atual é 2.4.3/código 10 e usa `admin.html?app=mensagens`: recebe esta interface do site. Não é necessário um APK novo para as correções da tela compartilhada. O manifesto e a assinatura da release instalada foram preservados. Não foi disponibilizado o APK local de compilação; mudanças do código nativo ficam na fonte para uma futura compilação oficial com a assinatura vigente.

## Testes e estética

- 402 verificações Worker/SQLite/provedores simulados, incluindo fila após falha, nova tentativa e reentrega sem duplicação.
- 49 testes Android/Robolectric aprovados; lint e compilação release aprovados. A assinatura local não foi usada para distribuição.
- Editor de pessoa e blocos em quatro viewports; ficha preservada: 45 verificações/axe/teclado aprovadas.
- Produtos em 320×700, 390×844, 412×915, 1440×900 e altura 480: cache antes da rede simulada, filtros, contagens, acentos, seleção, abrir/fechar durante consulta e múltiplos toques.
- Cartões em quatro viewports e fonte 100/130%: limites geométricos sem sobreposição; ações da fileira alinhadas; miniatura acionada por teclado.
- Regressões de mensagens/mídias e push executadas separadamente, sem tráfego real nos testes.

Skill TENKiTER aplicada. Tarefa humana: editar um contato sem espera ambígua, localizar peças com os filtros do site e consultar fotos sem sobrepor ações. **APROVADO COM LIMITAÇÃO**: navegador e Robolectric não comprovam IME/desempenho físico/FCM; a verificação no aparelho fica com o proprietário. Alvos novos ≥48 px, menu rolável sem encobrir os controles, Fechar sempre disponível, reflow verificado a 320 px. Evidências fictícias: [filtros 390](erro-03/filtros-390.png), [altura reduzida](erro-03/filtros-altura480.png), [cartões 390](erro-04/cards-390.png).
