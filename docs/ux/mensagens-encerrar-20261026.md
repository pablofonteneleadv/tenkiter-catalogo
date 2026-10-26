# Mensagens: número do cliente, mesma pessoa nos 2 WhatsApp, encerrar e nome do atendente — 26/10/2026

Pedido do Pablo: "Tem vários que não estão cadastrados e que está aparecendo nome como Tenkitermodas. Se não está cadastrado era pra aparecer o telefone e nome que colocou no WhatsApp. Se tiver o mesmo número em ambos canais (...) uma forma de identificação, ou uma aba com alerta. Queria também o recurso encerrar (...) vai para uma aba de encerrados, e volta automaticamente se a conversa tiver nova mensagem. Podendo selecionar várias para encerrar também."

Tarefa humana: achar quem precisa de atendimento sabendo quem é cada pessoa, e tirar da frente o que já foi resolvido.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência (serviços simulados) em `mensagens-encerrar-20261026/`: `00-antes-390.png` (antes), `01-lista-numero-e-ambos.png`, `02-conversa-faixa-ambos.png`, `03-selecao.png`, `04-encerradas-reabrir.png`, `05-computador.png` (1280), `06-selecao-320.png` e `06-selecao-412.png`.

## Por que aparecia "tenkitermodas"
Quando a primeira mensagem da conversa sai do celular da loja, a Wafly manda como nome o do próprio WhatsApp da loja ("tenkitermodas" no 1, "Tenkitermodas Reserva" no 2), e ele era gravado como nome do cliente.
- Mensagem enviada pela loja não dá mais nome à conversa. O nome vem do cliente: o que ele colocou no WhatsApp, quando ele escreve.
- Conversas antigas: o servidor descobre qual é o nome da loja quando o mesmo nome aparece enviando para dois contatos diferentes. Aí as conversas com esse nome voltam a mostrar o número. Nada é apagado além desse nome errado.

## Na tela
- **Número sempre visível:** sem nome, a conversa mostra o número formatado, como "(88) 9331-6895". Com nome, o número fica numa linha pequena embaixo da prévia, ao lado da etiqueta do canal, e nem o nome nem o número são cortados. Na primeira versão o número ficava ao lado do nome e sumia a 390 px; a revisão encontrou isso e a linha foi trocada.
- **Mesma pessoa nos 2 WhatsApp:** os dois números são comparados com e sem o 9º dígito. A conversa ganha o sinal laranja "Também no WhatsApp 2". Ao abrir, uma faixa diz "Esta pessoa também está falando pelo WhatsApp 2" com o botão "Abrir". O filtro "Nos 2 WhatsApp · N" fica com a borda laranja quando há alguém.
- **Encerrar:** ⋯ → "Selecionar conversas", ou segurar o dedo numa conversa. As conversas recebem uma marca redonda e a barra do pé mostra "Todas · Encerrar N · Cancelar" (botões de 44 px). Também dá para encerrar uma só pelo ⋯ da conversa.
- **Encerradas:** a conversa sai das outras listas e contagens e vai para o filtro "Encerradas · N", onde dá para reabrir uma ou várias. Ela volta sozinha quando o cliente manda mensagem nova; mensagem enviada pela loja não a reabre. Encerrar zera o "não lida" só no painel e não mexe no celular.
- Esc sai da seleção, e o foco vai para a barra quando a seleção começa pelo menu.
- Correção de layout: a busca passava 24 px da coluna das conversas, por causa da regra geral de input.

## Nome do atendente nas respostas
Pedido: "opção de colocar nome do atendente. Pré-definido para primeiro nome, mas com a opção do atendente escrever o nome que gostaria (...) selecionado padrão, mas admin pode desmarcar ou marcar. Esse nome aparece antes da mensagem."
- Ligado por padrão. A resposta sai como "*Ana:*" + quebra de linha + texto no WhatsApp, onde o nome aparece em negrito; no Instagram sai "Ana:", porque lá não existe negrito.
- O padrão é o primeiro nome do cadastro de quem está logado; nome todo em maiúsculas vira "Pablo". Acima da caixa de mensagem fica a linha "Respondendo como **Ana** · Mudar nome", com 44 px de altura; ali o atendente escreve o nome que quer e salva com Enter. O nome fica guardado no servidor para aquela pessoa e vale em qualquer aparelho. Nome vazio volta ao primeiro nome.
- ⋯ → "Configurações (leitura e nome)…" → "Nome do atendente nas respostas": a caixa "Mostrar o nome de quem responde antes da mensagem" liga ou desliga para todos (marcada por padrão), mostra um exemplo e tem o campo do nome.
- Na conversa, a bolha enviada mostra o nome como rótulo verde, sem os asteriscos. A prévia da lista mostra "Ana: texto".
- Espiando, a linha fica escondida junto com a caixa de resposta; volta ao tocar em Atender.
- Evidência: `07-assinatura-390.png`, `08-assinatura-nome-escolhido.png`, `09-config-assinatura.png`, `10-assinatura-computador.png`.

## Medições
- 320×700 e 412×915: sem rolagem horizontal. A barra de seleção fica colada ao pé (639–700 / 854–915). Os alvos da barra medem 68×44, 97×44 e 88×44.
- 1280: a barra fica no pé da coluna das conversas, sem passar da largura dela.

Testes: `mensagens_encerrar` (novo, 35 verificações, axe na seleção e na faixa), `mensagens_assinatura` (novo, 22, axe na linha e na configuração), `mensagens_mestre` (21), `mensagens_dashboard` (99), `mensagens_grupo` (8), `worker_mensagens_conversa` (134, com 23 novas) e os demais `worker_*`.

Resultado: APROVADO COM LIMITAÇÃO. A regra do nome da loja segue o que a Wafly mandou nas conversas do print. Se em algum caso a Wafly mandar o nome do cliente nas mensagens enviadas, o efeito é só mostrar o número até o cliente escrever. Não foi testado no aparelho Android real.
