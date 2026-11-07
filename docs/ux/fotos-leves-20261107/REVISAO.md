# Revisão — fotos leves e painel mais leve (07/11/2026)

Skill `tenkiter-estetica-humana`. Chromium com Apps Script e Worker de mídia SIMULADOS (não é validação em Android real). Fotos de 1080 px sintéticas (ruído, ~300 KB cada) — por isso as imagens parecem "granuladas"; o que vale é o peso e o enquadramento.

**Tarefa humana:** a vitrine abre rápido no celular e a lista do painel responde logo depois do login. Nada muda no desenho: só o peso das fotos e o momento em que a lista é montada.

| Tela | 390 px (antes / depois) | 1440 px (antes / depois) |
|---|---|---|
| Vitrine | `vitrine_antes_390.jpg` / `vitrine_depois_390.jpg` | `vitrine_antes_1440.jpg` / `vitrine_depois_1440.jpg` |
| Janela de entrada do painel | `painel_login_antes_390.jpg` / `painel_login_depois_390.jpg` | `painel_login_antes_1440.jpg` / `painel_login_depois_1440.jpg` |
| Lista do painel depois de entrar | `painel_lista_antes_390.jpg` / `painel_lista_depois_390.jpg` | `painel_lista_antes_1440.jpg` / `painel_lista_depois_1440.jpg` |

## Checklist
- Enquadramento 4:5, selos, bolinhas de fotos, botões e rodapé idênticos antes/depois (o cartão não mudou; a foto vem de uma cópia de 480 px, a bolinha de uma de 240 px).
- Janela de entrada: antes mostrava a lista pela transparência; agora mostra só o fundo da página (menos ruído visual, nenhuma foto baixada).
- Alvos de toque, foco, contraste e rolagem lateral: sem alteração (nenhum CSS novo; `content-visibility: auto` nos cartões já existia).
- Lista grande (> 80 produtos): os 80 primeiros cartões aparecem na hora e o resto logo em seguida (60 ms). Busca, filtros, seleção em massa e edição em lote continuam atuando sobre a lista inteira (a seleção é guardada por ID).
- Erro/sem cópia: se a cópia reduzida não existe (foto antiga ainda sem backfill), o Worker devolve a original: a foto nunca some.

## Números (tests/painel_leve.py, 390 px, CPU 4x mais lenta, 697 produtos)
Ver a descrição do PR.
