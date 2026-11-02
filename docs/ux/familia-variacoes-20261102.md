# Família de produtos: estampa ou tamanho, sem digitar nada (7.47.0)

## Pedido do Pablo (02/11/2026)
- Ao ligar 5 peças como família, a janela pedia "Tamanho/idade" escrito. **Premissa da loja:** tamanho, idade, cor e categoria nunca são escritos pela pessoa, para não criar duplicidade com pouca diferença.
- Ligar peças já cadastradas **não deve pedir nada nem mudar nada** nelas: só reconhece que são o mesmo produto.
- Família não é só de tamanhos: o mesmo produto pode variar por **estampa** (ex.: "Conjunto longo Farm" azul, marrom, rosa).

## Como ficou
- **Ligar como família (lote):**
  - a janela só lista as peças (foto, nome, código, tamanho tirado do nome quando houver, estoque) e tem um botão "Ligar N peças como família";
  - não tem nenhum campo;
  - o nome da família vem do nome das peças (sem o tamanho do fim, quando houver);
  - os alertas continuam: nomes diferentes, ou peças já em famílias diferentes (nesse caso o botão fica desativado).
- **Rótulo:** nunca é digitado.
  - É tirado automaticamente do nome já cadastrado (PP…EXG, G1–G4, Único, RN, 1–16, 34–56, "N anos", "N meses", "Tam N", "Nº N").
  - Sem tamanho no nome (estampas), fica vazio e a foto identifica a peça.
  - Nenhum texto é inventado (nada de "Estampa 1"); só o nome acessível usa "opção N".
- **"+ Nova variação desta família"** (antes "+ Novo tamanho"):
  - o cadastro vem igual à original, inclusive o nome;
  - fotos, tamanhos, cores e quantidade vêm vazios, e a pessoa escolhe esses dados nos mesmos campos do cadastro;
  - não existe campo extra nem obrigatório;
  - ao cadastrar, a peça entra na família. A ligação pendente (servidor fora) continua sendo refeita na próxima abertura.
- **Caixa Família na edição:** foto de cada peça; a atual tem borda preta e "esta". Embaixo, o tamanho (se houver) ou o número da posição.
- **Sugestões:** o Worker agora também agrupa nomes iguais sem tamanho (estampas). A legenda de cada foto é o tamanho ou, sem tamanho, o código da peça.
- **Vitrine:** "Outras opções".
  - Cada opção é a foto da peça (54×68) com o tamanho embaixo, quando houver.
  - A peça aberta fica com borda preta; a esgotada fica apagada e com o tamanho riscado.
  - O botão tem 64 px de largura e mais de 44 px de altura.
- **Esteira:** o cartão da família mostra a foto de cada peça e, se houver, o tamanho; o texto diz "N peças · X de N conferidas".
- **Servidor:** `/familias/ligar` sem `nome` usa o nome da peça. Rótulos só entram quando vêm do nome. Mensagens passaram de "tamanho" para "peça".
- **Dados existentes:** famílias já ligadas ficam como estão, sem migração nem exclusão.

## Revisão estética (skill tenkiter-estetica-humana)
- **Tarefas humanas e critérios de sucesso:**
  - **equipe:** ligar peças do mesmo produto com um toque, sem digitar;
  - **equipe:** cadastrar outra estampa/tamanho reaproveitando a peça;
  - **cliente:** ver e pular entre as opções do mesmo produto pela foto;
  - **conferência:** distinguir cada peça da família.
- **Referências reutilizadas:**
  - gaveta `.overlay-sheet/.sheet` e `.fam-membro` da 7.44.0;
  - figuras `.fam-fig` das sugestões, reaproveitadas na caixa da edição;
  - botões arredondados da peça aberta (`catalogo.css`);
  - `.peca.tam` da Esteira.
  - Não entrou componente nem tema novo. As fotos viraram protagonistas no lugar do texto, como pede a skill.
- **Viewports:** 390×844 e 1440×900, nas jornadas automatizadas.
- **Medições:**
  - botões da gaveta, da caixa Família e de "Outras opções" com 44 px ou mais;
  - sem rolagem horizontal;
  - Esc fecha a gaveta;
  - textos montados com nós;
  - erros em português.
- **Evidência** (pasta `familia-variacoes-20261102/`):
  - `gestao_ligar_lote_390/1440.jpg` (janela sem campos);
  - `gestao_nova_variacao_390/1440.jpg`;
  - `gestao_edicao_com_familia_390.jpg`;
  - `gestao_sugestoes_390.jpg`;
  - `vitrine_outras_opcoes_390/1440.jpg`;
  - `esteira_familia_390.jpg`.
- **Resultado:** APROVADO COM LIMITAÇÃO. As fotos nos testes são simuladas (aparecem vazias). Falta ver com produtos e fotos reais e num Android físico.

## Testes
- `node tests/worker_familias.js`: 55 ok. Inclui: estampas viram sugestão sem rótulo, grupo de 1 continua fora, e ligar sem nome nem rótulo pega o nome da peça.
- `node tests/worker_esteira.js`: 184 ok.
- `tests/familia_gestao.py`: 57 ok. Cobre:
  - nova variação sem campo extra, com o mesmo nome;
  - ligação sem rótulo digitado;
  - janela do lote sem nenhum campo;
  - lote mandando só as peças e os rótulos do nome;
  - sugestão de estampas;
  - caixa com fotos;
  - tirar da família;
  - servidor fora.
- `tests/familia_vitrine.py`: 40 ok. Inclui "Outras opções" com foto e tamanho, e estampas só com foto, lado a lado e trocando de peça.
- `tests/esteira_ui.py`: 221 ok.
- **Regressão:**
  - OK: `lote_editar`, `lote_rapido`, `cadastro_tipos`, `admin_lista_v424`, `catalogo_cards_fotos`, `busca`, `filtros_facetas`, `axe_telas_a/b`, `arquivar_apos_cadastrar`;
  - OK: `check_js`, `check_html`, `check_workers`, `check_secrets`, `check_ux_skill`, `check_graphify`.
  - `service_worker.py` tem um caso intermitente (link curto `/p/` offline) que falha também na `main` sem esta mudança.
