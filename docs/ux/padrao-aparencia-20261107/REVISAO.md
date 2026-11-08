# Revisão — padrão de aparência (v7.57.0, 07/11/2026)

Ambiente: Chromium com serviços simulados (`tests/mock.py`), 390x844 e 1440x900. Não é validação em aparelho Android.

- Capturas: `antes/` (main 5080a6c) e `depois/` (este commit), mesmas telas e fixtures. Folhas lado a lado: `lado-a-lado-390.png` e `lado-a-lado-1440.png`.
- Teste: `python3 tests/padrao_aparencia_ui.py` (R1 alvos >= 44, R2 campos 44/16/raio 8, R3 foco laranja, R4 tokens, R5 foto 4:5, R6 aria-pressed, R7 botão principal). Resultado: 231 verificações, 0 falhas.

| Portão da skill | Resultado |
|---|---|
| Alvos de toque | 0 controles < 44 px nas 22 telas medidas (antes: 146 na lista, 70 na vitrine, 56 no Cadastro, 27 em Métricas) |
| Campos | 44 px, fonte 16, raio 8 em todas as telas (antes 39 a 52 px, raios 0 a 12) |
| Foco | contorno laranja de 3 px, inclusive RH e Verificar |
| Contraste | botão de Verificar com texto escuro sobre laranja |
| Estado sem cor | chips com `aria-pressed` |
| Mobile/desktop | sem rolagem horizontal; corrigido alargamento a 320 px em Compartilhar seleção |
| CLS da vitrine (rede lenta) | 0,155 para 0,025 (390); 0,268 para 0,047 (1440) |

Ressalvas: controles pequenos sobre a foto (remover foto, setas de ordem) agora ocupam 44 px e cobrem parte da miniatura; o "x" de arquivar da vitrine (equipe) tem 44 px. Falha pré-existente em `tests/instagram_admin.py` (faixa escondida), igual na main.
