# Mensagens para o atendimento: produtos, respostas rápidas, filtros e seleção — 26/10/2026

Pedido do Pablo (prints da tela de Mensagens): "Quero opção de selecionar para marcar como lidas e outras ferramentas que sirvam. Tinha 2 Pablo Fontenele Simon, mas aí encerrei um e ficou só 1, o nome dele era pra sair dessa aba (...). Tire lidas, não faz sentido. Troque 'Todas' por 'Mensagens' e 'Grupos' (duas abas que podem ser selecionadas separadas ou juntas). (...) quem vai usar o sistema mensagens serão nossos funcionários para atender nossos clientes, preciso que eles tenham nessa tela tudo que precisam para poder tirar dúvidas sobre nossos produtos e tentar fazer vendas. Reforme e melhore as funções e layout da tela de mensagens."

Tarefa humana: o funcionário responde a dúvida do cliente sobre uma peça e oferece o produto sem sair da conversa.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência em `mensagens-atendimento-20261026/`: `01-filtros-390.png`, `02-selecao-390.png`, `03-produtos-390.png`, `04-respostas-390.png`, `05-produtos-320.png`, `05-produtos-1280.png`.

## Lista
- **Filtros:** "Mensagens" e "Grupos" (em preto quando ligados) ficam no lugar de "Todas". Ligados juntos mostram tudo, e cada um pode ficar sozinho. Desligar o único que está ligado passa para o outro, para a lista nunca ficar vazia.
- Depois de um separador vêm "Não lidas", "Falta responder", "Nos 2 WhatsApp" e "Encerradas". Funcionam um de cada vez, e um novo toque desliga.
- Saiu o filtro "Lidas".
- **Seleção** (⋯ → Selecionar conversas, ou segurar o dedo numa conversa):
  - na primeira linha, "N selecionadas · Todas · Cancelar";
  - na segunda, **Marcar lidas · Não lidas · Encerrar N**.
  - "Marcar lidas" também marca como lida no celular quando a opção do canal está ligada, como acontece ao abrir a conversa.
  - "Não lidas" muda só o painel.
- **Nos 2 WhatsApp:** uma conversa encerrada não conta mais. Encerrou uma das duas, a outra sai do filtro e perde o aviso "Também no". As duas voltam quando o cliente escreve na encerrada.

## Conversa
- A barra acima da caixa de mensagem tem **Produtos**, **Respostas** e, à direita, o nome da assinatura ("Pablo ✎", que abre a troca do nome). Tudo cabe numa linha de 44 px.
- **Produtos:** uma gaveta por cima da conversa (no computador, um painel de 420 px à direita).
  - Busca por nome, código, categoria, cor ou tamanho no catálogo que o painel já carregou, sem nova chamada ao servidor. Só aparecem produtos ativos, e "Só com estoque" vem marcado.
  - Cada produto mostra foto, nome, preço à vista (o mesmo cálculo da vitrine, ou "Consulte valor"), código, tamanhos e estoque.
  - **Colocar na mensagem** junta ao que já foi escrito: nome (em negrito no WhatsApp), preço, tamanhos, cores e o link da peça. O WhatsApp mostra a prévia com a foto, porque o link é o mesmo das prévias do site. O atendente revisa antes de enviar.
  - **Copiar link** copia só o link.
- **Respostas rápidas:** tocar numa resposta coloca o texto na mensagem.
  - Começam só com o que o site já sabe: endereço, link do catálogo e Instagram. Nada foi inventado.
  - Em "Editar respostas", a loja cria as suas (horário, pagamento, entrega…), até 30, que valem para toda a equipe.
- Esc e o "voltar" do celular fecham a gaveta sem fechar a conversa, e o que estava escrito continua lá.
- *Negrito*, _itálico_ e ~riscado~ do WhatsApp aparecem formatados nas bolhas, e a prévia da lista sai sem os símbolos.
- O cartão de contato mostra o nome e o número, e a localização mostra o nome e o endereço; antes aparecia só "Contato". Vale para mensagens que chegarem depois da publicação.

## Medições
- Barra de ferramentas: 44 px de altura, com botões de 44 px, a 320, 390 e 1280 px, sem nada vazando.
- Barra de seleção em duas linhas de 44 px; cabe a 320 px.
- A gaveta fica dentro da coluna da conversa, sem rolagem lateral.

Testes: `mensagens_atendimento` (novo, 35 verificações, axe nos filtros, na seleção e nas duas gavetas), `mensagens_mestre` (21), `mensagens_dashboard` (100), `mensagens_encerrar` (35), `mensagens_assinatura` (22), `mensagens_grupo` (8), `worker_mensagens_conversa` (149, com 15 novas) e os demais `worker_*`.

Resultado: APROVADO COM LIMITAÇÃO.
- A leitura no celular, no "Marcar lidas" em lote, usa o mesmo caminho de "abrir a conversa" (Wafly e Instagram), que ainda não foi conferido no aparelho real.
- O formato do cartão de contato segue o padrão da Wafly/Z-API (`displayName` e `vCard`).
- Não foi visto num Android real.
