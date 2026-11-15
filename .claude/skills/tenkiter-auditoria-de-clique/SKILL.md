---
name: tenkiter-auditoria-de-clique
description: Use depois de refatorar ou ao receber relato de botão que "não faz nada" na Esteira (esteira.html, esteira-fluidez.js, esteira-fotos-revisao.js, esteira-processos.js) quando a leitura do código não achou erro. Traça cada botão pela sequência de mudanças de estado e acha handlers que se desfazem.
---

# Auditoria de clique da Esteira

Inspirada em ECC skills/click-path-audit (MIT). Cada função funciona sozinha e o botão ainda falha: a chamada B desfaz o que a A fez. Leitura estática não vê isso; é preciso simular a ordem dos efeitos.

## Mapa do estado da Esteira (esteira.html)

Estado compartilhado do módulo: `ABA` (aba atual), `HOJE`, `CATALOGO`, `EU`, `usuario`, `CAIXA_VER`, `AVISO_FOTOS`, `sessaoAtual` e o DOM (`app.dataset.tela`, `aria-selected` das abas, folhas de `abrirFolha`). Persistência: `salvarRetomada()` / `recuperarCampos()` (retomada após recarga), `localStorage` em `esteira-fluidez.js` (aba e filtro), IndexedDB `tenkiter_esteira_processos_v1` (fila de `esteira-processos.js`). Janelas: `abrirFolha` e `abrirConferencia` empilham em `TKCamadas` e fecham com Voltar/Esc/✕ por `tentarFechar` (pergunta se há alteração).

## Passo a passo

1. **Liste os pontos de toque** da área escolhida: `grep -n "onclick\|addEventListener('click'" esteira.html esteira-*.js` e as funções `abrir*` / `desenhar*` (ex.: `abrirPedirFotos`, `abrirEnviarCaixa`, `abrirColocar`, `abrirCadastroNovo`, `abrirRegistros`, `desenharAbas`, `desenharCaixa`).
2. **Para cada botão, escreva a trilha** em tabela: `chamada -> lê -> escreve -> efeito colateral (reset, redesenho, fecha folha, limpa rascunho)`.
3. **Pergunte em cada passo:**
   - A chamada seguinte reescreve o que a anterior acabou de definir?
   - `desenharAbas()` ou `abrirAba()` descarta a folha aberta ou o campo digitado?
   - `salvarRetomada()` roda antes da mudança de `ABA` (o botão de aba chama antes, de propósito)?
   - `fundo.remove()` roda sem `TKCamadas.desempilhar`, deixando camada fantasma que quebra o Voltar do Android?
4. **Confira o estado final contra o rótulo:** "Salvar" deixa o item salvo e a lista atualizada; "Fechar" não perde rascunho sem perguntar; a contagem da aba (`.aba-num`) bate com `HOJE.fotos`.
5. **Procure os padrões que se desfazem:**
   - Reentrada: duplo toque dispara duas vezes o envio (`await` sem trava; a fila de processos usa ID de operação, confira se o fluxo novo usa).
   - Resposta atrasada: `abrirAba()` termina depois de o usuário trocar de aba (o código compara `ABA === aba` e `sessaoAtual`; chamadas novas precisam do mesmo cuidado).
   - Recarga no meio: `recuperarCampos(estado)` clica em elementos por seletor; seletor renomeado deixa a retomada sem efeito.
   - Troca de conta (`tk:sessao`): rascunho de uma conta aparecendo em outra.
6. **Confirme em execução,** não só no papel: Playwright em 390x844 com serviços simulados (padrão de `tests/esteira_processos_ui.py` e `tests/esteira_fluidez_ui.py`). Clique, espere o estado assentar e afirme o estado final visível.
7. **Cada bug achado vira teste** (`tenkiter-bug-vira-teste`), no módulo `esteira` do manifesto.

## Saída esperada

Tabela por botão: handler, trilha de estado, veredito (`ok` / `se desfaz` / `estado inconsistente`), prova (linha do código ou teste). Corrija só o que a tabela provou; não refatore o vizinho.

## Limites

Só leitura e simulação; não toque em dados reais de pedido, foto ou cliente. Simulação não substitui validação no Android (regra 16 do `CLAUDE.md`): o que depende de Voltar nativo, câmera ou notificação entra na conferência de `tenkiter-canario-pos-deploy`.
