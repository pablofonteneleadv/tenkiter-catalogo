# Família de produtos (7.44.0, Esteira entrega 4)

A loja cadastra o mesmo modelo várias vezes, uma peça por tamanho ou idade ("Sunga infantil masculino P", "... M", "... G"). Cada uma tem as fotos das estampas daquele tamanho, estoque e link próprios.

Decisão do Pablo: criar a **família de produtos**. Cada tamanho continua um produto separado (tamanho e estampas aparecem por peça), mas os tamanhos ficam ligados.

## Onde fica cada coisa
- **Ligação:** no D1 do `instagram-worker`, nas tabelas `fam_familia (id, nome, criada_em, criada_por)` e `fam_membro (produto, familia, ordem, rotulo)`. A planilha e o Apps Script **não mudam**.
- **Rota pública:** `GET /familias` responde antes da checagem de sessão, como `/cliente/foto` e os webhooks. Usa o mesmo CORS e devolve só `{familias:[{id,nome,membros:[{produto,rotulo,ordem}]}]}`, sem quem criou nem quando. Cache de 5 min no KV e `Cache-Control: public, max-age=60`. Toda mudança limpa o KV.
- **Rotas autenticadas** (`catalogo_cadastrar` ou `gerir_acessos`):
  - `POST /familias/ligar {produtos, nome?, rotulos?}`: cria a família ou junta à família que uma das peças já tem. Peças de famílias diferentes dão 409.
  - `POST /familias/membro {produto, familia, rotulo, ordem?}`: sem `ordem`, a peça entra no lugar do tamanho.
  - `POST /familias/desligar {produto}`: se sobrar só uma peça, a família é desfeita.
  - `POST /familias/ignorar {chave}`: vale para toda a equipe.
  - `GET /familias/sugestoes`.
- **Sugestões:** agrupam peças ativas do catálogo com o mesmo nome depois de tirar o tamanho/idade do fim, ignorando acento e caixa. Valem PP, P, M, G, GG, XG, EG, EXG, G1–G4, U/Único, 1–16, 34–56, "N anos", "N meses", RN, "Tam N" e "Nº N". Um número fora das faixas ("Kit 20", "Vestido 2024") não conta como tamanho. Só entram grupos de 2 ou mais peças que ainda não estão em família.
- **Ordem dos tamanhos:** RN, meses, anos, números, PP…G4, Único.

## Telas
- **Gestão (`admin-familias.js` + ganchos pequenos no `admin.html`):**
  - Na edição, a caixa "Família" mostra os tamanhos ligados (o da peça aberta fica marcado), **"+ Novo tamanho desta família"** e **"Tirar da família"**. Tirar pede um segundo toque e explica que a peça continua no site.
  - **"+ Novo tamanho"** usa o fluxo de duplicar que já existe. O nome vem sem o tamanho, e o campo **"Tamanho/idade desta peça \*"** mostra "Nome no site: …". Fotos, tamanhos, cores e quantidade ficam vazios.
  - Se a peça original ainda não tem família, o formulário também confirma o tamanho dela (já vem preenchido pelo nome).
  - Quando o cadastro (`create`) dá certo, a peça nova é ligada. Se o servidor das famílias falhar, a ligação fica em `tk_fam_pendentes_v1` e é refeita na próxima abertura da Gestão.
  - **Seleção em lote:** "Ligar como família" aparece com 2 ou mais peças marcadas. A janela sugere o nome da família e os rótulos, que podem ser editados. Se os nomes forem diferentes ou as peças já estiverem em outra família, ela avisa.
  - **"Sugestões de famílias"** (no topo da lista): cada grupo mostra fotos com o tamanho embaixo, "Ligar" e "Ignorar". Quando não sobra nada, aparece um estado vazio explicado.
- **Vitrine (`catalogo.js`):**
  - Continua um card por tamanho. Depois da ordenação, `agruparFamilias_` junta os membros que passaram no filtro na posição do primeiro deles, na ordem da família.
  - Busca e filtros valem por produto.
  - Na peça aberta, "Outros tamanhos: P · M · G" usa botões de 44 px. O tamanho aberto fica marcado e o esgotado aparece riscado. Trocar de tamanho troca a peça e o endereço (`?c=`), sem empilhar outra janela.
- **Esteira (`esteira.html` + worker):**
  - A família conta como 1 dos 20 itens e vai inteira para a mesma pessoa, com a pontuação do membro mais urgente. Tamanho conferido ou atualizado há pouco fica fora.
  - Na aba Hoje, o cartão da família tem os tamanhos dentro. Cada tamanho abre a conferência de sempre.
  - "X/20" e o Painel contam a família como 1. Ela só fica feita quando todos os tamanhos da lista foram conferidos.

## Sem família, a vitrine fica como hoje
- A primeira pintura nunca espera `/familias`. Se houver cache local válido (`tk_familias_v1`, 10 min), a grade já sai agrupada.
- O pedido tem limite de 2,5 s (AbortController). Erro, lentidão ou modo offline deixam tudo como antes.
- Se a lista chega depois da primeira pintura, a grade só é reorganizada quando a pessoa ainda está no topo (menos de 120 px de rolagem) e sem janela aberta. Nos outros casos, o agrupamento entra na próxima renderização (filtro, busca, ordem ou lista nova do servidor).
- Cache corrompido é ignorado. O `pwa.js` e o service worker não mudaram (o teste `service_worker.py` passou).

## Revisão estética (skill tenkiter-estetica-humana)
- **Tarefas humanas:**
  - **cliente:** ver os tamanhos do mesmo modelo juntos e pular entre eles;
  - **equipe:** cadastrar o próximo tamanho sem refazer tudo e ligar o que já existe;
  - **Esteira:** conferir uma família como um item.
- **Referências:** card da vitrine e linha de tamanhos da peça aberta (`catalogo.css`); folhas `.overlay-sheet/.sheet` e botões arredondados do admin; `.peca`, `.chip` e borda laranja das tarefas na Esteira. Não entrou componente nem tema novo.
- **Viewports:** 390×844 e 1440×900, nas jornadas automatizadas `familia_vitrine.py`, `familia_gestao.py` e `esteira_ui.py`.
- **Ajustes feitos na revisão:**
  - cartão da família na Esteira: o selo "conferir cada tamanho" espremia o nome em 390 px. Agora o selo só aparece quando a família está feita, e o progresso fica no texto ("0 de 3 conferidos");
  - botões "Outros tamanhos": a regra `font` inválida foi trocada por propriedades separadas (o peso 700 não aplicava);
  - prévia "Nome no site" continuava vermelha depois de corrigido o erro: agora volta ao normal;
  - campos de rótulo no desktop limitados a 320 px.
- **Medições:**
  - sem rolagem horizontal em nenhuma tela testada;
  - botões da gaveta de famílias, de "Outros tamanhos" e dos tamanhos no cartão da Esteira com 44 px ou mais;
  - Esc fecha a gaveta e o foco volta;
  - erros em português, sem JSON;
  - textos de dados montados com nós (`textContent`), sem HTML com dados.
- **Evidência** (nesta pasta):
  - `familia-produtos-20261101/vitrine_familia_390.jpg`, `vitrine_familia_1440.jpg`, `vitrine_outros_tamanhos_390.jpg`;
  - `gestao_edicao_familia_390.jpg`, `gestao_novo_tamanho_390.jpg`, `gestao_novo_tamanho_1440.jpg`, `gestao_ligar_lote_1440.jpg`, `gestao_sugestoes_390.jpg`;
  - `esteira_familia_390.jpg`, `esteira_familia_feita_1440.jpg`.
- **Resultado:** APROVADO COM LIMITAÇÃO. Faltou validar com Android físico, Apps Script real e D1/KV reais. As fotos do teste são simuladas, então os cards aparecem sem imagem.

## Testes
- `node tests/worker_familias.js`: 52 ok. Cobre:
  - separação de nome em 17 padrões;
  - pública sem sessão, com CORS, cache e sem dados de quem criou;
  - 401/403;
  - sugestões (acento/caixa, inativa fora, grupo de 1 fora);
  - ligar (ordem, nome, conflito 409, juntar à família existente);
  - membro;
  - desligar (desfaz com 1 peça);
  - ignorar;
  - D1 fora com mensagem legível.
- `node tests/worker_esteira.js`: 124 ok (13 novos):
  - família como 1 item;
  - inteira para a mesma pessoa;
  - pontuação pelo mais urgente;
  - membro recente fora;
  - sem famílias, igual a antes;
  - rota Hoje com rótulos e progresso;
  - Painel.
- `tests/esteira_ui.py`: 163 ok (cartão da família, conferência por tamanho, 0/2 → 1/2, 390 e 1440).
- `tests/familia_vitrine.py`: 34 ok:
  - cards juntos e em ordem, na posição do primeiro membro;
  - ordenação por preço;
  - filtro parcial e busca;
  - "Outros tamanhos";
  - `/familias` com erro e lento (sem resposta) = vitrine normal em menos de 2,4 s;
  - cache local e cache corrompido.
- `tests/familia_gestao.py`: 49 ok:
  - "+ Novo tamanho" pré-preenchido sem fotos, tamanhos, cores e quantidade, com o tamanho obrigatório; `create` com o nome final e ligação com os rótulos;
  - ligar em lote;
  - sugestões (Ligar/Ignorar/vazio/Esc);
  - tirar da família;
  - servidor fora → ligação refeita na próxima abertura.
- **Regressão, tudo OK:**
  - `worker_mensagens_conversa`: 436;
  - `worker_mobile_push`, worker como ESM;
  - `catalogo_cards_fotos`, `busca`, `filtros_facetas`, `filtros_v66`, `rolagem_infinita`, `vitrine_orientacao`, `selecao_filtros_v64`, `service_worker`;
  - `lote_editar`, `lote_rapido`, `cadastro_tipos`, `pre_envio`, `arquivar_apos_cadastrar`, `cadastro_plano_mestre`, `admin_lista_v424`, `axe_telas_a/b`;
  - `check_js`, `check_html`, `check_workers`, `check_secrets`, `check_ux_skill`, `check_graphify`.

## Decisões e limitações
- **Família de uma peça só:** não existe. Ao tirar o penúltimo membro, a família é desfeita.
- **Estoque no "+ Novo tamanho":** também fica vazio, além de fotos, tamanhos e cores, porque é próprio de cada tamanho.
- **Cadastro terminado em outra tela:** se o registro leve terminar em outra tela do app (keepalive), a ligação à família acontece quando a Gestão confirmar o envio de novo. O `opId` devolve o mesmo id.
- **Busca na vitrine:** não procura pelo nome da família, só pelo nome de cada peça (que já traz o modelo).
- **Mudança de família durante o dia:** a Esteira guarda a família no momento em que monta a lista (`est_lista.familia`). Ligar ou desligar durante o dia vale a partir da próxima lista.
- **Sugestões:** usam a lista do catálogo em cache de 10 min (a mesma da Esteira).
