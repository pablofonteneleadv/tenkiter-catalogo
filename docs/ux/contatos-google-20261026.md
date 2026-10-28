# Google Contatos: ponte, cópia de segurança e relatório da primeira limpeza — 26/10/2026

Pedido do Pablo: salvar no Google Contatos quem chega pelo WhatsApp sem cadastro. Primeiro, uma importação inicial que confere os números, evita duplicados, junta os repetidos e aproveita para fazer a primeira limpeza. Depois, o site manda para o Google (marcador **"Tenkiter Clientes G"**). Os contatos ficam em outro e-mail, não no do Apps Script do catálogo.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `contatos-google-20261026/01-configuracao.png` e `02-relatorio.png`.

## Como está montado
- **Ponte** (`contatos-ponte-1.0.gs.txt`, no Cofre): um Apps Script publicado pelo Pablo na conta dos contatos.
  - Sem a chave secreta, não responde nada (o `doGet` só diz a versão).
  - Ações: `ping`, `listar`, `backup` (arquivo JSON na pasta "TENKiTER backups" do Drive daquela conta), `criar` (no marcador, sem duplicar por número com e sem o 9), `atualizar`, `apagar` e `juntar` (só com `confirmar:true`).
- **Servidor das mensagens:** guarda o endereço e a chave da ponte só no servidor; a tela só sabe se está ligada. Rotas:
  - `/msg/contatos/situacao`, `config` (liga após o `ping` da ponte; desligar apaga o endereço e a chave);
  - `backup`;
  - `relatorio` (exige a cópia antes).
- **Relatório:** lê todos os contatos e não muda nada. Mostra:
  - pessoas repetidas pelo número (com e sem o 9, com máscara, sem o 55);
  - números a padronizar (+55 e o 9 do celular antigo);
  - números inválidos;
  - contatos sem número;
  - quem conversou no WhatsApp e não está no Google.

## Na tela
- **Onde:** ⋯ → Configurações → "Google Contatos (marcador Tenkiter Clientes G)".
  - Desligada: campos para o endereço da implantação e a chave (escondida, tipo senha) e o botão "Ligar a ponte".
  - Ligada: mostra a conta, a última cópia de segurança (com o link do Drive), "Fazer cópia de segurança", "Gerar relatório da limpeza" (travado até existir cópia), "Ver o último relatório" e "Desligar a ponte".
- **Relatório:** abre no lugar da lista, com cartões de resumo e seções que abrem, cada uma com até 80 itens. Diz claramente que nada foi mudado no Google.
- **Correção de layout:** a caixa de Configurações ficou comprida e agora rola por dentro (no máximo 58% da altura), sem empurrar a lista.

## Próxima etapa (depende do Pablo aprovar o relatório real)
Juntar os repetidos, padronizar os números e criar no marcador quem conversou e não está no Google. Depois disso, cada número novo sem cadastro entra sozinho, e editar ou apagar um contato no site faz o mesmo no Google.

Testes:
- `validacao/contatos-ponte-1.0.js` no Cofre: 23 verificações, com People, Drive e propriedades simulados.
- `worker_mensagens_conversa`: 175 verificações, 17 delas da ponte (endereço e chave inválidos, página de login, a chave nunca volta, relatório só depois da cópia, duplicados, inválidos, padronizar, sem cadastro, só leitura, desligar).
- `contatos_google`: 17 verificações (novo), com axe.

Resultado: APROVADO COM LIMITAÇÃO. A ponte ainda não foi publicada; a ligação real depende do Pablo seguir os 5 passos do cabeçalho do arquivo.

## Atualização de 27/10/2026: contas grandes (15 mil+ contatos)
A conta da loja tem mais de 15 mil contatos; a cópia de uma vez passava do tempo de espera do servidor (90 s) e o aviso sumia em 9 s, então nada aparecia.
- **Cópia em partes** (ponte 1.1, `backup_parte`): cada parte dura até ~40 s e grava `parte-NN.json` numa subpasta. O painel repete até acabar.
- **Relatório em etapas:** uma página por chamada, guardada numa tabela temporária, apagada ao montar o relatório.
- **Na tela:** faixa preta fixa no pé com "⏳ Copiando os contatos do Google: 5.000 de 15.300 contatos (33%)", barra laranja e "Não feche esta tela. Ela fica acesa até terminar." (`role=status`). A faixa fica no pé para não cobrir o fechar nem os menus do topo.
- Tela acesa por Wake Lock (pedida de novo se a pessoa volta para a aba); aviso do navegador antes de sair da página; confirmação ao fechar as Mensagens; botões dos contatos apagados enquanto roda.
- Evidência: `contatos-google-20261026/03-copiando-390.png` e `04-copiando-1440.png` (faixa a 33%).
- Testes: `contatos_google` 23 (progresso nas 3 partes, tela acesa e liberada, aviso de saída liga e desliga, faixa some no fim, página e pasta passadas); `worker_mensagens_conversa` 195; `validacao/contatos-ponte-1.1.js` 30 no Cofre.
- Limitação: o Wake Lock depende do navegador do aparelho (Chrome no Android aceita; alguns navegadores ignoram). Sem ele, a faixa e o aviso continuam.

## Limpeza aprovada e cadastro automático (27/10/2026, site 7.36.0)
Decisões do Pablo sobre o relatório real (14.699 contatos): juntar repetidos ficando o nome mais completo; padronizar (+55 e o 9; fixo sem o 9); 9 dígitos sem DDD → DDD 88; criar novos como "TM Cliente nome do WhatsApp ou número".
- **Tela:** no relatório, quadro "Limpeza aprovada" com as regras escritas e o botão "Aplicar a limpeza aprovada" (confirmação com os 5 passos). A faixa mostra "Etapa 3 de 5 · Juntando as pessoas repetidas: 488 de 976 pessoas (50%)". Ao terminar, volta para Configurações com o resumo escrito ("✓ Limpeza feita: 976 pessoas juntadas…"), a linha "Limpeza feita …" e a caixinha "Cadastrar sozinho os números novos do WhatsApp no Google".
- **Se cair no meio:** o que já foi feito fica; juntar e criar pulam o que já existe, e padronizar não muda o que já está certo. Tentar de novo continua sem estragar.
- Evidência: `contatos-google-20261026/05-limpeza-feita.png`.
- Testes: `contatos_google` 29 (as 5 etapas na ordem, relatório antes de juntar, resumo, caixinha ligada e desligada); `worker_mensagens_conversa` 212 (plano, nome mais completo, cópia de 6 h, juntar, padronizar, criar "TM Cliente", fim liga o automático, fila uma vez por número, nome ou número formatado, desligar); `validacao/contatos-ponte-1.2.js` 47 no Cofre.
- Limitação: as chamadas em lote do Google têm cota por minuto; se o Google recusar no meio, a tela mostra o erro e basta tentar de novo.
