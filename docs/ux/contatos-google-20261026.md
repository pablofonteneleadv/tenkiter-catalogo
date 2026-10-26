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
