# Acabamento da vitrine (Opção A) — 26/10/2026

Tarefa humana: abrir o catálogo, achar uma peça, entender o preço e consultar pelo WhatsApp. O que precisa de atenção primeiro é a foto, depois nome, preço e o botão de WhatsApp.

Escopo aprovado pelo Pablo: "Opção A — mesma loja, acabamento novo" do relatório de auditoria. Todas as funções, a mesma ordem e os mesmos textos de ação; muda só a aparência.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`.

## O que mudou

- `icones.js` (novo): um conjunto de ícones SVG de linha. Os outros scripts usam `window.TKIcone ? ... : emoji` e continuam funcionando nas telas que não carregam o arquivo.
- `acabamento.css` (novo, carregado por último): escala de texto 12/13/14/16/20/22, cantos 6–8 px, borda fina, sem sombra, selos em preto, estoque com ponto de cor e texto.
- Preço: "R$ x à vista" e "Normal R$ y", em preto, sem riscado. O valor e o cálculo não mudaram.
- Card: "Consulte esta peça" é o botão principal (verde, 44 px); "Selecionar" é ação secundária (texto, 44 px).
- Peça aberta: Favoritar · Compartilhar · Selecionar numa linha e "Consultar no WhatsApp" inteiro, sem caixa alta. A gaveta continua igual.
- Seleção e favoritos: sem emojis, sem caixa alta, preço em preto.
- Cabeçalho com 56 px e botões de 44 px (eram 36 px). Busca encostada no cabeçalho.
- Desktop: campos do filtro lateral inteiros.

## Medidas (antes → depois)

| Item | Antes | Depois |
|---|---|---|
| Cabeçalho | 54 px | 58 px (56 + borda) |
| Topo da busca fixa | 62 px (faixa vazia de 8 px ao rolar) | 58 px (sem faixa) |
| Botões do cabeçalho | 36×36 | 44×44 |
| Coração do card | 36×36 | 44×44 |
| Botões de ação do card | 44–46 px | 44 px |
| Botão principal da peça | 48 px | 50 px |
| Barra inferior | 50 px | 55 px |
| Rolagem horizontal a 320, 390, 412 e 1440 px | não | não |

Contraste: texto secundário 6,0:1 no fundo creme e 6,6:1 no branco; "Selecionar" 5,4:1; botão verde 6,6:1; placeholder 5,0:1.

## Evidência

- `acabamento-20261026/celular-antes-depois.jpg`: início, peça e seleção a 390×844.
- `acabamento-20261026/desktop-antes-depois.jpg`: início e peça a 1440×900.
- Telas extras conferidas: 320×640, 412×915, filtros abertos, menu lateral, favoritos vazios, sugestões da busca e foco por teclado no cabeçalho.

Testes com serviços simulados, rodados na `main` (a1bf8ab) e nesta mudança:

| Teste | main | esta mudança |
|---|---|---|
| jornada_cliente, jornada_pedido, teclado, compartilhar_foto, botao_voltar, selecao_link, rolagem_infinita, x_equipe, push_cliente, visual_v60, convite_app, equipe_catalogo1, lote_editar, foto_cliente | passam | passam |
| axe_telas_a | passa | passa |
| axe_telas_b | 1 tela com problema (filtros abertos, contraste ×7) | igual |
| selecao_vida | 2 falhas | as mesmas 2 |
| selecao_botoes, filtros_facetas, filtros_v66, filtro_menu_rolagem | falham | as mesmas falhas |
| busca, vitrine_orientacao | param com erro do próprio teste | igual |
| nav_app_unificado | parou com erro | passa |

As falhas da tabela já existiam na `main` e não foram mexidas aqui.

Testes ajustados (só o texto ou o ponto de toque, não a regra): `push_cliente` confere o sininho pela classe `ativado` em vez do emoji; `compartilhar_foto` confere "Compartilhar" + nome acessível "Compartilhar foto e link"; `vitrine_orientacao` espera "Consultar no WhatsApp"; `selecao_vida` toca no texto do aviso em vez do ponto fixo 195,300, que passou a cair no botão "Limpar e ver todas".

## Resultado

APROVADO COM LIMITAÇÃO. Não foi testado em Android/iPhone físico nem com teclado virtual real. Fotos dos testes vieram do catálogo publicado, servidas por simulação. A gaveta da peça no desktop e o fundo das fotos ficam para a Opção B.
