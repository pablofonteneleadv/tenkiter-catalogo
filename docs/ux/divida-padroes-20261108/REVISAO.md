# Revisão visual — pagamento de dívida de padrão (v7.63.0, 08/11/2026)

Tarefa humana desta PR: **tirar desvios conhecidos da catraca sem mudar o que a pessoa vê**. O critério de aprovação foi "igual ou melhor no padrão, nunca pior": cada tela tocada foi comparada ANTES (main) e DEPOIS (esta branch) em **390×844** e **1440×900**, com serviços simulados (`tests/mock.py`) e Chromium. **Não é validação em Android físico.**

## Como foi medido

Inventário de controles (rótulo, tag, id, largura, altura, posição, estado: visível, rolagem, coberto, cortado) + captura + contagem de pixels diferentes, antes e depois, em cada tela. Para `z-index`, comparou-se o `z-index` calculado de **todos** os elementos posicionados carregados em cada página. Scripts em `/tmp` do ambiente de trabalho (não entram no repositório).

| Tela | 390 | 1440 | Resultado |
|---|---|---|---|
| index, admin, esteira, fotos-ia, curriculos, treinamentos | 0 diferenças de controle, 0 pixels | idem | `?v=`, `a11y.js` e `z-index` sem efeito visível |
| 404 | só o link "Ir para o conteúdo" (oculto até Tab) aparece no inventário; 0 pixels | idem | igual |
| manual (redireciona para treinamentos) | 0 diferenças | idem | igual |
| Treino de cadastro (simulação) | "Preciso de uma ajudinha" 30 → 44 px de alto (área de toque); resto idêntico | idem | melhor (padrão de 44 px) |
| Postagens › Colagem | ✕ vira 44×44 contornado; "Baixar" e "Usar colagem" ocupam o espaço que sobrou; restante idêntico (26 controles) | só o ✕ muda (93 → 44 px); 26 controles | padrão |
| Postagens › ➕ Adicionar à arte | ✕ contornado e transparente; 50 controles com o mesmo tamanho (cabeçalho 1 px mais baixo) | idem | padrão |
| Treinamentos — aviso de sucesso | aviso padrão `TKAviso` (acima da barra inferior, com borda verde) no lugar da pílula escura | idem | padrão |
| Instagram — Descartar | aviso padrão com "Desfazer" (some em 8 s) acima do final da lista, no lugar da barra colada ao rodapé do painel | idem | padrão |

Capturas lado a lado (esquerda = antes, direita = depois) neste diretório: `colagem-*`, `simulacao-*`, `instagram-desfazer-390`, `treinamentos-aviso-390`, `404-*`.

## Achados e correções feitas durante a revisão

1. **Simulação de treino, botões de categoria** encolheram de 52 para 50 px ao carregar `tk-padrao.css` (o padrão força `min-height: 44px !important`, que vence o `min-height: 52px` local). Corrigido na própria página com `html body button.choice{min-height:52px!important}`; depois disso ficou 0 pixels de diferença nas categorias.
2. **404**: o `tk-padrao.css` já era pedido por caminho relativo, o que quebra em endereços aninhados (`/a/b`); os três arquivos passaram a ser pedidos por caminho absoluto.
3. **Colagem**: o botão "✕ Fechar" tinha texto; o padrão `tk-fechar` é só o ✕ de 44 px (com `aria-label="Fechar"` e `title`). O ✕ continuou no mesmo lugar do cabeçalho (não foi para o canto direito) para não reordenar a barra de ações da Colagem; fica como ponto de atenção.

## O que NÃO foi pago e por quê

- `common.js` (1 `fechar-sem-tk-fechar`, 1 `z-index` 130, 1 `alert`): o APK embute o arquivo; só o lote de fotos leves pode tocá-lo.
- `z-index` restantes (24): usam valores sem equivalente na escala (12, 19, 30, 40, 60, 70, 75, 84, 85, 89, 91, 95, 102, 22…) ou são camadas do tutorial (`tutorial-app.js`, 2147483646). Trocar mudaria a ordem das camadas; ficam para decisão do dono (propor tokens novos em `padroes-site.md` primeiro).
- `alert` (5) e `laranja-solto` (321, em `admin-postagens.js`/`admin-mensagens.js` e demais): outro PR.

Rever antes do merge: Postagens e Instagram no aparelho real (jornada: abrir Colagem, fechar, ➕ Adicionar, Descartar → Desfazer).
