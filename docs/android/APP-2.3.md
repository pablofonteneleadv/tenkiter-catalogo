# TENKiTER Mensagens 2.3.0

Instale por **Atualizar app**, sem desinstalar. A faixa da lista informa **v2.3.0**. Código6 e assinatura anterior preservada; o Android pede confirmação.

## Pessoas e contadores

A unidade dos filtros é o atendimento da pessoa, dentro dos canais/tipos escolhidos. WhatsApp1, WhatsApp2 e Instagram vinculados contam uma pessoa; as bolinhas de cada canal continuam informando quantas mensagens estão não lidas naquele canal.

**Não lidas**: pessoa com ao menos uma conversa não encerrada com mensagens não lidas. **Falta responder**: toda pessoa de Não lidas mais quem leu, não respondeu e continua sem encerrar. Assim, na mesma seleção, Não lidas nunca excede Falta responder. Marcar lida não resolve a pendência; responder ou encerrar resolve. Se o atendente marcar uma conversa como não lida, ela volta à pendência mesmo que a última mensagem tenha sido enviada pela loja.

Grupos começam desligados e podem ser ligados na faixa. Ao incluir grupos, a mesma regra vale para eles. Encerradas ficam fora dos dois contadores. O painel de métricas históricas continua separando grupos, como informa sua descrição.

Os canais vinculados aparecem em bloco: o mais recente em destaque e os demais compactos, ordenados por atividade dentro do bloco. Qualquer nova mensagem recebida/enviada sobe o bloco inteiro. A aba Nos2WhatsApp saiu; não é preciso procurar as conversas em outro filtro. Seleção por toque longo/Selecionar/avatares e encerramento por canal preservados.

## Nome e vínculo

Toque no **nome no cabeçalho da conversa** ou abra ⋮ → Contato e canais. Confira nome, WhatsApp principal, segundo WhatsApp e escolha conversas já existentes do Instagram ou WhatsApp. Salvar pede confirmação e preserva mensagens e históricos separados por canal. Não se vincula ninguém por semelhança do nome.

No Instagram, preencha o WhatsApp do cliente; se ele não informar, marque explicitamente essa opção. Quando houver número, o cadastro pode passar a usar esse WhatsApp. Segundo número também reúne as novas conversas correspondentes. O nome confirmado manualmente tem prioridade sobre nome importado/WhatsApp.

A importação anterior lia Google Contatos para relatório/limpeza, sem indexar os nomes no atendimento. O novo índice privado normaliza telefones e lê as páginas da ponte ao abrir o app/site. Essa consulta não edita, junta nem apaga contatos do Google. Nomes aparecem após a leitura inicial e sincronização; rede/cota do Google podem exigir nova tentativa ao reabrir. O cadastro automático e a limpeza confirmada continuam sendo operações separadas.

## Conversa e produtos

Cabeçalho único, atalhos de canais vinculados, bolhas adaptáveis, datas, links e prévias de foto/story. Áudio tem atalho de microfone; gravação continua com revisão antes de enviar. Vídeos abrem no player Android dentro do app; outros arquivos conservam o visualizador do sistema.

Produtos ocupam uma janela ampla com pesquisa e estoque, fotos maiores, nomes/preços/tamanhos sem altura fixa e recentes primeiro. Cada peça tem Colocar na mensagem/Copiar link. Marque várias para Colocar na mensagem/Copiar seleção, ou limpe a seleção. Nada é enviado ao inserir rascunho.

## Story/status respondido

Wafly: lê referência na raiz, no texto/contexto e em statusReply; tenta mídia citada e correspondência por ID de publicação/status capturado. Instagram/Zernio: lê storyReply do webhook/metadados/lista, preserva a mídia e identifica vídeo mesmo sem postagem correspondente do site. Ao abrir a conversa do Instagram, tenta recuperar poucos contextos antigos ainda disponíveis no provedor, sem marcar leitura nem responder como efeito dessa consulta.

Quando o contexto exato existe, a prévia/abertura usam a mídia correspondente. Candidato aproximado é rotulado **provável**; não é apresentado como certeza. Mensagens antigas cujo provedor não entrega mais mídia ou identificação não têm recuperação garantida. O servidor guarda diagnóstico apenas de campos/tipos, sem conteúdo/token em logs compartilhados.

42 testes Android simulados, testes SQLite/R2/provedores falsos e jornada web em320/390/412/1440. Instalação física, teclado real/TalkBack, codecs, gravação e entrega FCM precisam de conferência no aparelho. Nenhuma mensagem/push/alteração real em contatos foi feita como teste. Consultas de diagnóstico na produção foram somente leitura e agregadas.

As demais funções de [2.2](APP-2.2.md) e os limites do banco local/arquivos temporários permanecem aplicáveis.
