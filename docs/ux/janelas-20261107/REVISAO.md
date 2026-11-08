# Revisão estética — janelas e navegação (v7.57.0)

Evidência: capturas `antes-*` (main) e `depois-*` (este PR) em 390 e 1440 px, geradas com serviços simulados (Chromium, não Android).

Tarefa humana: fechar, voltar e trocar de aba do mesmo jeito em qualquer janela, sem perder o que foi feito.

Conferido por teste (`tests/janelas_padrao.py`, 390 e 1440): ✕ 44×44 contornado em todas as janelas; aba ativa preta com `aria-selected`; Voltar/Esc/toque fora/foco/Tab; foco laranja de 3 px e "Ir para o conteúdo" nas 10 páginas; folhas em `dvh`; escala `--z-*`.

Portões: alvo ≥ 44 px (aprovado); foco visível (aprovado); sem rolagem horizontal (aprovado nas folhas conferidas); ✕ da Minha conta não cobre mais a faixa do CPF (aprovado, ver `depois-minha-conta-390.png`).

Limites: validação só em Chromium simulado; Android real e leitor de tela ficam para conferência manual. Tutorial guiado (iframe) e "Preparar vídeo" não tiveram captura.
