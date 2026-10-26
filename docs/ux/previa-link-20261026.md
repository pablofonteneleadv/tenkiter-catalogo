# Mensagens: prévia do link em cada mensagem — 26/10/2026

Pedido do Pablo (print do WhatsApp com o link da Térmica UV sem miniatura): poder escolher, em cada mensagem, se o link vai com prévia ou sem, com um seletor ali no lugar da mensagem.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `previa-link-20261026/01-desmarcada-390.png`, `02-marcada-390.png`, `03-marcada-412.png` e `04-marcada-1440.png`.

## Tarefa humana
A atendente põe um produto (ou uma seleção) na mensagem e decide, antes de enviar, se o cliente vê o cartão com a miniatura. O foco continua sendo a mensagem e o botão Enviar; a caixinha é uma decisão rápida, de um toque.

## Como ficou
- Uma linha logo acima do campo da mensagem: caixinha "Mostrar prévia do link (miniatura)". Só aparece no WhatsApp, quando o texto tem link e não há anexo. Some depois do envio.
- Começa desmarcada (igual era). A última escolha de cada canal fica lembrada neste aparelho.
- Marcada, o servidor manda pelo `/send-link` da Wafly com o primeiro link do texto. O cartão leva:
  - peça do site (`/p/TK-…`): o nome e "R$ … à vista · tamanhos";
  - seleção (`?sel=`): "Peças separadas para você" e "N peças na TENKiTER Modas";
  - outros links do site: "TENKiTER Modas";
  - link de fora: sem título inventado (fica com o que o WhatsApp achar).
- Se a Wafly não confirmar, vale a regra de sempre: nada é reenviado sozinho.

## Medições
- Linha da caixinha: área de toque de 44 px de altura; fica entre a barra Produtos/Respostas e o campo, sem cobrir nada.
- Sem rolagem horizontal em 390, 412 e 1440. axe sem falhas sérias.

## Testes
- `tests/mensagens_previa_link.py`: 24 verificações (novo).
- `worker_mensagens_conversa`: 179 (4 novas: `/send-link` com o link sem o ponto final, título e descrição limpos; sem link volta ao texto simples; desmarcada continua texto simples; título cortado em 100 letras).

Resultado: APROVADO COM LIMITAÇÃO. A documentação da Wafly não aceita a foto do cartão; a miniatura deve vir da própria página (as páginas de produto já têm a foto de prévia). Só um envio real no Android confirma se a foto aparece.
