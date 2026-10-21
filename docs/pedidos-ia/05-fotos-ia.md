# 05-fotos-ia — FOTOS COM IA (P-26 + P-29 juntos)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

Leia as seções v4.27/v4.29/v4.34/v4.36/v4.37. **A IA nunca escreve texto/seta/emoji na imagem.** A chave do Gemini nunca volta ao navegador. Módulo no Worker: `montarPlanoFotoIA_`, `textoLooks_`, `gerarComMotores_`, tabela D1 `fotoia` (coluna `plano`).
**P-26 · Fotos com IA em LOTE**: (1) a pessoa informa a **quantidade de looks** (ex.: 10) e o sistema oferece **opções de divisão** em imagens (ex.: 2 imagens de 3 looks + 2 de 2; ou outras) respeitando o limite de referências por pedido (Cloudflare: 4 fotos ⇒ 2 looks; Gemini: até 6); (2) o plano já vem **montado** (cima+baixo e looks inteiros) e a pessoa **troca peças entre looks ARRASTANDO**, com alternativa acessível (◀▶ ou toque-escolhe-toque-troca, alvo ≥ 44 px) antes de gerar; (3) no motor grátis (Cloudflare) tentar até 3 looks por imagem **só se** couber nas 4 referências; senão dividir. Seja honesto na tela quando a qualidade puder cair. Pedidos antigos (sem plano) continuam funcionando.
**P-29 · Legenda + link no resultado**: abaixo de cada foto gerada, botão recolhível (fechado) com (1) **legenda pronta**: nome, preço **à vista** e código de cada peça (mesma lógica de `legendaPadrao`/`legendaBloco_` em `admin-postagens.js` e regra ,99/,49; peça sem preço ⇒ "Consulte valor"); (2) **link** `SITE_URL?sel=<códigos>` (formato de `linkDaSelecao_` em `pedido.js`; SEMPRE `SITE_URL`, nunca `API_URL`; máx. 60) para o cliente ver só as peças da foto; botões **Copiar**. Guarde no pedido os códigos das peças (nova coluna D1 com `ALTER TABLE` automático em `iniciar`, como `plano`); pedidos antigos sem isso não mostram o botão.
Testes: seção "FOTOS COM IA" de `worker_ig.js` (Google/Cloudflare FALSOS), `foto_ia.py`, axe das telas novas. Acrescente casos: divisão de N looks, troca por arrasto/botões, legenda/link, pedido antigo. **Não provado contra IA real** — diga no relatório.

## Testes do setor
`foto_ia.py`, `worker_ig.js`, `novas_telas.py`
