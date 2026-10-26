# Mensagens: quem mandou no grupo — 26/10/2026

Pedido do Pablo: "conserte como aparece as mensagens no grupo, não tem identificação aí, não dá pra saber quem mandou".

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `mensagens-grupo-20261026/grupo-390.png` (390×844, serviços simulados).

- Cada balão de quem não é a loja mostra, no topo, o nome do WhatsApp em negrito, com uma cor por pessoa, e o número em cinza ao lado; sem nome, mostra só o número.
- As cores seguem a ordem em que as pessoas aparecem na conversa (8 cores com contraste de pelo menos 4,5:1 sobre o branco), então duas pessoas nunca ficam com a mesma cor até a nona.
- Menções que chegam como número interno do WhatsApp (@266124864270572) viram @Nome quando essa pessoa já mandou mensagem no grupo; sem isso aparece "@alguém do grupo" (número interno) ou o telefone formatado.
- O link "Foi resposta a um story?" saiu dos grupos, onde não faz sentido.
- Mensagens gravadas antes desta versão aparecem como antes, sem o rótulo, porque o autor não era guardado.

Testes: `mensagens_grupo` (novo, 8 verificações), `mensagens_dashboard` (99), `worker_mensagens` (com 5 verificações novas), `worker_mensagens_conversa` e os demais `worker_*`.

Resultado: APROVADO COM LIMITAÇÃO. Não testado com o webhook real da Wafly: os campos `senderName`, `participantPhone` e `participantLid` seguem o formato documentado da Wafly (o mesmo da Z-API).
