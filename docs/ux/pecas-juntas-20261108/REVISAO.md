# Produtos juntos sem teto — 7.62.0

Revisão pela skill `tenkiter-estetica-humana`. Chromium com serviços simulados; não é validação em Android real.

## O que mudou na interface
- O botão "Usar os N produtos juntos" não tem mais "(máx. 8)" nem fica desabilitado: com 10 produtos marcados ele aparece habilitado (`10-produtos-390.png`, `10-produtos-1440.png`).
- Com mais de 10 fotos aparece, acima da prévia, o grupo "← Anteriores · 1–10 de 100 fotos · Próximas →". Só dez canvases ficam montados por vez (`100-produtos-previa-390.png`, `100-produtos-previa-1440.png`).
- Story com mais de 60 mídias avisa antes de enviar e mantém a seleção (aviso pelo `msg` já usado na janela).

## Verificação
- Componentes reutilizados: `po-chips`, botões padrão da janela, `TKCamadas` (janela já existente). Nenhuma cor, fonte ou raio novo; `check_padroes.py` sem aumento de baseline.
- Alvos de navegação com `min-width/min-height` de 48 px; teste mede >= 44 px em 390, 412, 1440 e 320 px.
- Teclado: o foco fica no botão que acabou de ser usado (ou no que continua habilitado); toque e Enter funcionam.
- axe (wcag2a/aa/21aa) sem violações na janela de Postagens nos 4 tamanhos.
- Limite: a barra Anteriores/Próximas quebra em duas linhas a 390 px (aceitável, sem rolagem horizontal).
