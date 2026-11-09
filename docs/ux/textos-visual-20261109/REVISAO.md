# Revisão visual — v7.65.0 (textos e acabamento) — 09/11/2026

Evidência: Chromium com serviços simulados (`tests/mock.py`), viewports 320, 390, 412 e 1440 px. **Não é Android nem integração real.**
Capturas nesta pasta: `mensagens-{antes,depois}-*`, `curriculos-{antes,depois}-*`, `minha-conta-depois-*`, `caixa-selecao-depois.png`.

**Tarefa humana:** ler os rótulos sem tropeçar (gramática, palavra inteira), trocar de aba com um toque e ver o foco do teclado e a caixa marcada sem dúvida.
Telas de referência: as próprias telas antes da PR (capturas "antes"); componentes reutilizados: `.tk-abas` (janelas.css), token `--tk-foco-cor` (tk-padrao.css), `input.produto-chk` (tk-padrao.css).

| Item | Antes | Depois | Resultado |
|---|---|---|---|
| Mensagens 1440, abas do painel estreito | "Solicitaçõe/s" e "atendiment/o" partidos; abas com 56 px de altura | nenhuma palavra partida; cada aba 71 px x 44 px, faixa cabe nos 379 px (320/390/412 sem mudança) | APROVADO |
| Currículos, abas | 176 e 137 px (1440 e 390) | 413 px cada a 1440, 178 a 390, 143 a 320 (as duas dividem a linha), 44 px de altura, sem rolagem lateral | APROVADO |
| Minha conta, aba "Entrar" | 75 x 44 px | 121 px (320), 156 (390), 167 (412/1440), todas com 44 px | APROVADO |
| Foco do teclado | #E67E22: 2,85:1 sobre #fff | #D35400: 4,17:1 sobre #fff; 3,59:1 sobre #eee; 4,66:1 sobre #0d0d0d; 3,44:1 sobre #2a2a2a (menor caso, ainda >= 3:1) | APROVADO |
| Caixa de seleção da Gestão | quadrado escuro translúcido, borda branca | vazia = escura com borda branca, anel e sombra; marcada = laranja cheio com visto escuro; legível sobre branco, bege, laranja e escuro; alvo continua 44 x 44 | APROVADO |

Textos: concordância corrigida em Gestão, Esteira, Cadastro, Postagens, Famílias e Fotos IA (lista e testes em `tests/textos_visual.py`). Textos antigos gravados continuam reconhecidos.

Medições: alvos >= 44 px nas abas e na caixa; sem rolagem horizontal a 320 px (`tests/janelas_sem_estouro.py`: 176 ok).
Limitação: sem aparelho Android real. Fonte do CI Linux renderiza ~1 px menor; as abas usam `min-height: 44px` explícito.
Resultado geral: **APROVADO COM LIMITAÇÃO** (validação em aparelho físico pendente).
