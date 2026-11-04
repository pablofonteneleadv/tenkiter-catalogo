# Solicitar fotos dos produtos selecionados

## Tarefa e resultado

A equipe deve selecionar uma ou várias peças na Gestão ou no catálogo, tocar em **Solicitar fotos**, escolher como quer as fotos e acrescentar uma observação opcional. Cada peça recebe um pedido no fluxo existente **Esteira → Fotos**.

O formulário é compartilhado entre as duas telas, abre no próprio contexto e preserva a seleção. Reutiliza as opções da Esteira: No pano, No manequim, Das outras cores/estampas e Outro (escrever). A observação vale para todos os produtos da seleção. Não gera fotos com IA, altera produtos ou envia mensagens externas.

## Contratos preservados

- Endpoint existente `POST /esteira/fotos/pedir`; sessão nos cabeçalhos; permissões de equipe continuam verificadas pelo Worker.
- Um pedido e um identificador estável por produto; nova tentativa envia somente os produtos sem confirmação. Resposta `repetido` também é uma confirmação válida do servidor.
- Sem alterações no Apps Script, banco, `common.js` ou aplicativo Android.
- Sem sessão válida, não envia. Visitantes não veem a ação administrativa no catálogo. Troca de conta interrompe o envio do rascunho anterior.
- Fechar e reabrir a mesma seleção preserva formulário e progresso durante a página atual. Isso não é uma fila persistente após fechar/recarregar o navegador.
- Registro só é anunciado após confirmação do servidor. Falhas são exibidas por produto e podem ser repetidas sem reenviar os confirmados.

## Revisão visual

Referências: barra de seleção da Gestão, menu Edição em lote do catálogo e formulário Pedir fotos da Esteira. Mantidos Inter, preto quente, superfícies claras, bordas e campos simples. Nenhuma biblioteca visual nova; CSS restrito ao diálogo compartilhado, com TKCamadas, Escape, voltar, foco e contenção de Tab.

Viewports exercitadas: 390×844, 412×915, 1440×900, reflow a 320×700 e altura reduzida 390×470 com texto ampliado a 130%. Conteúdo interno rolável e ação principal em rodapé separado; `visualViewport` ajusta a altura disponível. Botões do diálogo medidos com pelo menos 44×44 CSS px (altura definida em 48 px). Nenhuma rolagem horizontal ou ação principal fora da viewport nos cenários testados.

Capturas antes/depois e dos estados preenchidos, desktop e área reduzida são geradas por `tests/pedir_fotos_lote.py`; no CI ficam no artefato `evidencias-reparos-integrados`, pasta `pedir-fotos-lote`. As capturas locais foram abertas e examinadas. Validação do teclado físico: contenção de Tab/Shift+Tab e Escape; teclado virtual representado por altura reduzida, sem alegação de teste em aparelho.

Resultado: **APROVADO COM LIMITAÇÃO**. Não há defeitos conhecidos nos cenários verificados; não houve teste físico em Android nem criação de pedidos de fotos em produção.

## Verificações

- `tests/pedir_fotos_lote.py`: seleção exata nas duas telas, opções e observação em cada pedido, validação de Outro, sessão/conta, permissões negadas, retry parcial com mesmo identificador, foco, Escape, reflow e áreas reduzidas; axe WCAG AA no diálogo quando disponível (o CI prepara axe).
- Regressões `selecao_botoes.py` e `juntar_admin.py`: seleção, limpar e fluxo anterior de Juntar preservados.
- Sintaxe dos arquivos JS alterados, estrutura HTML, distribuição/cache, inventário de testes e contratos das skills conferidos localmente.
- Todos os testes de escrita usam serviços simulados, sem envio de fotos ou alterações em produtos reais.

Graphify: `start` e a consulta `estPedirFotos_ abrirPedirFotos selecionadosBulk` foram tentados. A extração excedeu o limite de 180 segundos neste Windows; o grafo gerado sem validação completa não foi usado como prova. O fluxo foi conferido diretamente em `estPedirFotos_`, `estPedidoFotosLimpo_`, seleção em lote e testes. O teste adicional do Worker no Node local não executou por limitação preexistente de importação ESM de caminhos Windows; não é um resultado aprovado do Worker. O endpoint não foi modificado.

Backup do código anterior: branch `backup/pre-solicitar-fotos-selecao-20261104`, base `e1f5d7f`, e arquivo Git exportado fora do repositório. CI e publicação devem ser conferidos no PR antes de considerar a alteração disponível em produção.
