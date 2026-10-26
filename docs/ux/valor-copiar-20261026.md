# Filtro por valor em "Escolher peça para copiar" — 26/10/2026

Pedido do Pablo: "Quero poder pelo valor também como filtro" (tela cheia do passo 3).

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `valor-copiar-20261026/celular.jpg`, `celular-filtrado.jpg` (390×844), `desktop.jpg` e `desktop-filtrado.jpg` (1280×860).

- Nova linha de botões "Valor" abaixo de Categoria, no mesmo estilo das outras: "Todos os valores" e cada valor cadastrado com a contagem, do mais barato ao mais caro; "Consultar valor" por último. Tocar de novo desmarca.
- A contagem de cada linha considera as outras escolhas (público, categoria, valor), como já era.
- Ordem ganhou "Menor valor" e "Maior valor" (peças "Consultar valor" ficam no fim nas duas).
- Sem rolagem horizontal da página a 390 e 1280 px (as linhas de botões rolam de lado, como antes); sem erro de JavaScript.

Testes: `admin_categorias` (80 verificações; 4 novas de valor).

Resultado: APROVADO COM LIMITAÇÃO. Não testado em aparelho físico.
