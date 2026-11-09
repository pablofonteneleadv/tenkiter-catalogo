# Revisão — Fila de envio do Mensageiro (v7.70.0)

Capturas em 320, 390, 412 e 1440 px: `fila-na-fila-*` (três mensagens em fila com servidor preso) e `fila-falha-no-meio-*` (a segunda falhou, a terceira aguarda).

## O que a pessoa vê
- Ao tocar Enviar a bolha aparece na hora. A primeira mostra 🕓 (enviando); as seguintes mostram ⏳ e "Na fila." Confirmada vira ✓.
- Se uma falha: a bolha fica vermelha com o motivo, **Tentar de novo** e **Descartar** (os mesmos botões de antes). As seguintes da MESMA conversa mostram ⏳ "Aguardando a mensagem anterior, que não foi enviada. Resolva a anterior para esta seguir." Outras conversas não são afetadas.
- O campo de texto e o botão Enviar ficam livres o tempo todo (o botão não vira mais "Enviando…").
- Falha numa conversa que não está aberta: aviso curto "Uma mensagem para … não foi enviada. Abra a conversa e toque em Tentar de novo."

## Checklist (skill de estética humana)
- Funcionalidade: teste `mensagens_fila_ui.py` em 390 e 1440 (ordem, falha no meio, descartar, resposta perdida, foto + texto, recarga, 30 min, outra conversa).
- Conforto: nenhum elemento novo de navegação; os estados reutilizam a bolha, o selo e o texto de apoio (`.ms-etapa`) que já existiam. Texto curto ("Na fila.") para não poluir quando há várias em fila.
- Mobile e desktop: capturas nas quatro larguras, sem rolagem horizontal (conferido no teste).
- Alvos de toque: "Tentar de novo" e "Descartar" são os botões que já existiam (inalterados). Sem emoji novo além do relógio de areia pedido pelo dono (⏳).
- Acessibilidade: o selo tem `role=img` e `aria-label` ("Na fila", "Aguardando a anterior", "Enviando", "Enviada", "Não enviada").
- Segurança: a fila guardada no aparelho não contém credenciais (conferido pelo teste); mensagem guardada há mais de 30 min não sai sozinha.

## Limites
- Foto, vídeo e áudio entram na ordem mas ficam só na memória (não voltam ao recarregar).
- Chromium e serviços simulados; não é validação em Android real.
