# Esteira — ajustes pedidos pelo Pablo (7.48.0)

Revisão pela skill `tenkiter-estetica-humana`. Evidências em `docs/ux/esteira-ajustes-20261102/` (JPG, geradas pelos testes com catálogo, login e servidor **simulados**).

## Tarefas humanas avaliadas
1. **Conferir peça:** a atendente confere a peça sem ser obrigada a contar. Ela vê as fotos em tela cheia e "Ver no site", para decidir se pede foto nova. Se algo estiver errado, vai ao cadastro.
   - Sucesso: salvar sem número funciona e não mexe no estoque.
   - Sucesso: a foto abre a galeria inteira e Esc fecha só as fotos.
2. **Preparar peça nova:** quem está em Fotos entende o fluxo e confere o cadastro com os dados na tela.
   - Sucesso: os passos aparecem no topo.
   - Sucesso: "Dados do cadastro" mostra fotos, nome, código, preço, categoria, público, tamanhos, cores, tecido, estoque e descrição.
   - Sucesso: "Editar no cadastro" abre a edição normal na Gestão.
3. **Fazer foto nova pedida na conferência:** reconhecer a peça.
   - Sucesso: a tarefa mostra foto(s) clicáveis, nome, código, categoria, cores, tamanhos, estoque e quem pediu.
   - Sucesso: a tarefa tem "Editar no cadastro".
4. **Montar pedido:** escolher o fornecedor (ou cadastrar sem sair do pedido), achar a peça de reposição com filtros e criar produto novo só com as opções da Gestão.
   - Sucesso: não existe campo de texto livre para fornecedor, categoria, público, tamanhos, cores ou tecido.

## Referências reutilizadas
- **Esteira:**
  - folha (`abrirFolha` + `TKCamadas`);
  - botões pílula `.bt`, chips `.chips`, `.card`, `.prep-topo`;
  - linha de status `role=status`;
  - confirmação no próprio botão.
- **Site:**
  - `TKFotoGrande` de `common.js` (o mesmo visualizador do catálogo);
  - `linkProduto`/`SITE_URL` para "Ver no site";
  - `TKTecido` para tecidos.
- **Gestão:**
  - listas de `action=categorias`, `action=generos` e `action=opcoes` (tamanhos e cores);
  - cadastro de tecidos;
  - critério de situação da lista (ativas, esgotadas, arquivadas, todas).
- **Mudança no componente compartilhado:** `TKFotoGrande.abrir` aceita `link: {url, rotulo}` opcional (botão branco na barra de baixo, outra aba). Sem `link`, nada muda para o catálogo e a Gestão.

## Mudanças visuais
- **Fotos:**
  - a foto é um botão próprio, com o ícone ⤢ no canto;
  - na lista do Hoje, a foto fica fora do botão que abre a conferência (`.peca-linha`), para não haver controle dentro de controle;
  - sem foto, não há botão.
- **Conferência:**
  - foto grande clicável, com "Ver no site" e "Editar no cadastro" logo abaixo do nome;
  - a quantidade traz "(opcional)" e mostra o estoque do site como referência.
- **Preparação:**
  - lista de 3 passos;
  - quadro recolhível "Dados do cadastro" (aberto enquanto falta conferir cadastro/cores e tamanhos);
  - tarefas do Hoje e "Outras tarefas" agrupadas por peça (ficha curta uma vez, tarefas embaixo).
- **Busca:** três seletores discretos (situação, categoria, público). Ficam areia quando estão no padrão e laranja quando estão ligados.
- **Fornecedor:** seleção + "Cadastrar fornecedor" + "Editar dados", com endereço e telefones abaixo. Lista com mais de 8 fornecedores ganha "Procurar fornecedor".
- **Produto novo e "veio a mais":**
  - categoria, público e tecido são `select`;
  - tamanhos e cores abrem chips, com busca quando a lista passa de 14;
  - valor antigo fora da lista fica em vermelho e precisa ser trocado.

## Medições e estados testados
- **Viewports:** 390×844 e 1440×900 em todas as jornadas novas; reflow a 320 px na Preparação com dados e no Painel.
- **Sem rolagem horizontal** em Hoje, conferência, Preparação, editor de pedido, folhas de fornecedor/produto novo e Painel.
  - Durante a revisão, o `select` de fornecedor com texto longo alargava o cartão para 422 px a 390 px. Corrigido com `width:100%` no item flexível.
  - Esse alargamento também deslocava o botão da folha para fora da área de toque.
- **Alvos ≥ 44 px:** botões, selects, links `.bt` e `summary` (verificado pelo teste). As miniaturas clicáveis têm de 44×55 a 96×120 px.
- **Teclado:**
  - Esc fecha o visualizador de fotos antes da folha da conferência;
  - o foco volta ao elemento que abriu;
  - o painel de chips tem "Pronto", que devolve o foco ao seletor.
- **Estados:**
  - catálogo carregando ("Carregando os dados do cadastro…");
  - catálogo indisponível (aviso + "Editar no cadastro");
  - peça excluída;
  - lista da Gestão indisponível (usa os nomes já usados nas peças, sem campo livre);
  - telefone inválido;
  - fornecedor repetido;
  - pedido antigo com fornecedor em texto (fica escolhido como "(sem cadastro)");
  - peça arquivada sem "Ver no site".
- **Ajustes feitos depois de examinar as capturas:**
  - campo de busca (`type=search`) sem estilo;
  - texto de apoio da tarefa de cadastro diferente no Hoje e na Preparação;
  - botões da ficha esticados no computador;
  - "Editar dados" solto à direita, que passou para a linha do fornecedor.

## Evidências
- Antes: `antes_conferir_390.jpg`, `antes_preparacao_390.jpg`, `antes_produto_novo_390.jpg`.
- Depois:
  - `conferir_quantidade_opcional_390.jpg`, `conferir_1440.jpg`;
  - `fotos_tela_cheia_ver_no_site_390.jpg`, `fotos_tela_cheia_1440.jpg`;
  - `hoje_tarefas_por_peca_390.jpg`, `hoje_1440.jpg`;
  - `preparacao_dados_do_cadastro_390/1440.jpg`, `outras_tarefas_390/1440.jpg`;
  - `busca_filtros_390/1440.jpg`;
  - `cadastrar_fornecedor_390/1440.jpg`, `pedido_fornecedor_escolhido_390/1440.jpg`;
  - `produto_novo_seletores_390/1440.jpg`;
  - `gestao_editar_link_390/1440.jpg`.

## Testes
- `node tests/worker_esteira.js`: 215 ok (antes 184).
- `tests/esteira_ui.py`: 311 ok (antes 221).
- `tests/admin_editar_link.py` (novo): 16 ok.
- Regressão:
  - `worker_familias`: 56 ok;
  - `familia_gestao`: 93 ok;
  - `admin_lista_v424`: 25 ok;
  - `lote_editar`: 15 ok.
- Checagens de CI (js, html, workers, segredos, skill UX, graphify): OK.

## Resultado
**APROVADO COM LIMITAÇÃO.**
- Validado só com serviços simulados no Chromium (Playwright). Não houve Android físico, catálogo real nem Worker publicado.
- As listas da Gestão são conferidas no Worker quando `action=categorias/generos/opcoes` responde. Quando não respondem, a conferência fica só na tela.
- Tecido é conferido só na tela: o servidor não tem os tecidos gravados nas descrições das peças.
