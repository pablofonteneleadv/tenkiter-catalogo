# Gestão: uniões no cadastro, Juntar/Separar em segundo plano, sessão rápida — revisão estética (v7.50.0)

Revisão pela skill `.claude/skills/tenkiter-estetica-humana` (checklist e contrato visual). Capturas reais (Chromium, serviços simulados por `tests/mock.py`, fotos sintéticas coloridas) em `docs/ux/gestao-unioes-20261103/`, geradas por `TK_EVID=docs/ux/gestao-unioes-20261103 python3 tests/gestao_unioes.py`. As "antes" (`antes-*.jpg`) vêm da `main` 7.48.3 com a mesma simulação.

## Tarefas humanas e critérios de sucesso

| Pedido | Tarefa | Critério observável | Evidência |
|---|---|---|---|
| 1. Uniões | Funcionária cadastra várias fotos e diz quais são do mesmo produto | "Unir fotos" → marcar → "Unir N fotos"; grupos com borda/cor e "G1/G2", "★" na capa, "Trocar capa", "Desfazer"; contador "Vão ser criados N produtos" e botão "Cadastrar N produtos"; cria 1 produto por grupo/foto solta | `unioes-inicio-*`, `unioes-marcando-*`, `unioes-grupos-*` |
| 2. Juntar | Juntar repetidos sem ficar presa na tela | A janela fecha na hora; aviso discreto "Juntando 3 peças em TK-…" → "Pronto: TK-… ficou com N fotos; 2 arquivadas."; erro em português com "Tentar de novo"; retoma depois de recarregar sem juntar duas vezes | `antes-juntar-preso-*` × `loja-juntando-*`, `loja-juntou-*` (e `tests/juntar_admin.py` na Gestão) |
| 3. Seleção | Abrir a peça a partir da sacola | Miniatura e nome são botões "Ver a peça …" (≥44 px); a peça abre por cima e voltar retorna à seleção | `selecao-*`, `selecao-abriu-peca-*` |
| 4. Login | Alternar loja ↔ Gestão sem esperar | Em <1 s aparece "Atendente: Ana Lojista" com o servidor ainda conferindo; ações sensíveis escondidas até confirmar; sessão recusada → login com "Sua sessão terminou…" | `antes-sessao-anonimo-*` × `sessao-gestao-instantanea-*`, `sessao-invalida-gestao-*` |
| 5. Fotos no card | Ver quantas fotos a peça tem | Selo "📷 6" no canto inferior esquerdo da miniatura (a lupa continua à direita), dentro da foto, `aria-label` com "(6 fotos)" | `antes-gestao-card-*` × `gestao-card-fotos-*` |
| 6. Separar | Transformar cada foto em um produto | Prévia "Vai virar 6 produtos" com as fotos na ordem ("fica em TK-0821" / "produto novo"), família (nova ou atual) ou soltos; segundo plano com progresso real "(2 de 5 novos)"; falha no meio diz que nada foi perdido e retoma sem duplicar | `separar-janela-*`, `separar-erro-*`, `separar-pronto-*` |
| 7. Menu | Menos repetição no topo | "Cadastrar peça" saiu do "O que fazer agora"; o "+ Cadastrar" laranja continua logo abaixo | `antes-gestao-topo-*` × `gestao-topo-*` |

## Referência visual e componentes reutilizados

- Aviso de segundo plano (`fila-lote.js`): mesmo desenho do `envios-flut` do cadastro (preto quente, borda laranja, verde no "Pronto", vermelho no erro), 86 px acima da base para não cobrir a barra inferior; sobe para 160 px quando o aviso de envios também está visível. Fica abaixo das janelas (não cobre a ação de uma janela aberta) e, com janela aberta, o "Pronto" espera ela fechar antes de sumir.
- Janela "Separar": `overlay-sheet` + `sheet` + `precos-modo` (os mesmos rádios de "Alterar preços") e `btn-primario`, aberta com `abrirComHistorico_` (TKCamadas: voltar/Escape fecham). Miniaturas em HTML com `atribSrc`.
- Uniões: dentro do passo 1 existente, sem novo componente de foto; borda do grupo reaproveita a borda da miniatura (3 px na cor do grupo). Cores dos grupos escuras (contraste ≥ 4,5:1 com o texto branco do selo); o laranja fica reservado para a marcação "✓" e para "Unir N fotos" (ação principal).
- Selo de fotos: mesmo formato do `mini-selo` da vitrine ("📷 N", fundo preto 78 %).
- Diferença justificada: o aviso usa texto e botões ("Tentar de novo", "Descartar", "OK") em vez de só ícone, pois a ação é incomum.

## Viewports, estados e medidas

- 390×844 e 1440×900 em todas as jornadas automatizadas (`tests/gestao_unioes.py`, 108 verificações); 390×844 em `tests/juntar_admin.py` (18); 320 px coberto por `tests/cadastro_tipos.py` (menu Cadastrar intacto).
- Estados: vazio (sem fotos: uniões escondidas), marcando (dica + "Unir" desligado até 2 fotos; limite de 8 fotos por grupo com aviso), grupos, carregando ("Juntando…"/"Separando… (n de m)"), sucesso, erro com recuperação, sessão conferindo/confirmada/recusada.
- Alvos: botões das uniões ≥ 40 px (os de ação principal 44 px); botões do aviso e da janela Separar ≥ 44 px; miniatura da sacola 48×60. Sem rolagem lateral (medido em 390 e 1440). A janela Separar cabe na tela com o botão alcançável.
- Teclado: fotos em modo "marcar" viram `role=checkbox` focáveis (Espaço/Enter marcam), testado; janelas fecham com voltar/Escape (TKCamadas).

## Problemas encontrados e corrigidos durante a revisão

- Botões "Trocar capa"/"Desfazer" quebravam linha no chip do grupo em 390 px → chip em linha inteira no celular, texto à esquerda e botões compactos à direita.
- Janela Separar herdava altura fixa de 82 vh (sobra branca) → altura pelo conteúdo, com área segura embaixo.
- A peça aberta pela seleção ficava por baixo da sacola (ordem no HTML) → sobe por cima enquanto aberta a partir da seleção e volta ao normal ao fechar.
- Login: a resposta "Sessão expirada." do interceptador sobrescrevia o aviso claro → a tela de login já aberta mantém o motivo.

## Resultado

**APROVADO COM LIMITAÇÃO.** Sem defeitos conhecidos nos critérios aplicáveis. Limitações materiais: validação em navegador com serviços simulados — não em aparelho Android físico nem com o Apps Script/Worker reais. Em aparelho, o "segundo plano" continua só enquanto a página (ou outra do site) estiver aberta: se o sistema fechar o navegador, o trabalho retoma ao reabrir a Gestão ou a loja (não prometido como envio com app fechado). O Separar exige servidor 4.19+ (opId); sem ele a ação avisa e não roda.
