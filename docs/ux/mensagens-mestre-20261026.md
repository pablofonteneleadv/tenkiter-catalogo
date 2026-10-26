# Mensagens: aba Todas, Espiar e leitura no celular — 26/10/2026

Pedido do Pablo: "uma aba mestre, onde apareça todas as mensagens, podendo filtrar por lida e não lida (...) uma opção para ler o conteúdo sem acusar como lido (...) abrir a mensagem normalmente aí sim tira o lido (isto serve para poder escolher o atendimento pela facilidade)".

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência (serviços simulados): `mensagens-mestre-20261026/todas-390.png`, `espiar-390.png`, `leitura-390.png` e as versões `-1280`.

- **Aba "Todas"** à esquerda das abas de canal; é a que abre. Cada conversa leva a etiqueta do canal (WhatsApp em verde, Instagram em rosa) e a contagem soma os três canais.
- **Filtros:** Todas · Não lidas · Lidas · Falta responder · Grupos, cada um com a quantidade.
- **Espiar** (só nas não lidas): botão de 44 px ao lado da conversa, com ícone de olho. Abre a conversa com a faixa "Espiando: não marca como lida aqui nem no celular" e o botão "Atender". A caixa de resposta fica escondida até tocar em Atender, para ninguém responder sem querer e deixar a conversa como não lida.
- **Abrir normal** marca como lida aqui e, com a opção ligada, também no celular oficial (o cliente pode ver os tiques azuis, se ele tiver isso ligado).
- **⋯ → Leitura no celular…:** uma caixa de seleção por canal e o resultado da última tentativa ("Última confirmação no celular: 13:07" ou o motivo da falha).
- **Aviso flutuante** acima da caixa de resposta: aparece tanto na lista quanto na conversa (no celular, antes ficava escondido com a conversa aberta).
- **Faixa "Saiu uma versão nova do site · Atualizar"** em todas as páginas, quando uma publicação acontece com a página aberta; ✕ fecha. Botões de 44 px.

Testes: `mensagens_mestre` (novo, 21 verificações, com axe), `mensagens_dashboard` (99), `mensagens_grupo` (8), `versao_nova` (novo, 12), `worker_mensagens_conversa` (111, com 10 novas) e os demais `worker_*`.

Resultado: APROVADO COM LIMITAÇÃO. A marcação de leitura no celular não foi testada na Wafly nem no Instagram de verdade: as rotas seguem a documentação (a Wafly segue a da Z-API). Se a Wafly recusar as duas rotas, o painel avisa e a configuração mostra o motivo.
