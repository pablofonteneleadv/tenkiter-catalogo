# Changelog

Todas as mudanças relevantes do site TENKiTER Modas.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

<!-- novas versões entram logo abaixo desta linha -->

## [7.40.18] - 2026-10-28

- App Mensagens: Voltar após abrir por notificação permanece na lista e ignora respostas atrasadas


## [7.40.17] - 2026-10-28

- Instagram: recebimento durável com recuperação automática de falhas. Catálogo: fotos extras sem sobrepor botões e cartões alinhados. Alterações do APK retiradas por orientação do proprietário.


## 7.40.16 — 28/10/2026
- Mensagens: quem fala pelo WhatsApp 1 e pelo WhatsApp 2 com o mesmo número aparece agrupado na lista (como as pessoas vinculadas), sem precisar vincular à mão.

## 7.40.15 — 28/10/2026
- Mensagens: **Funil de vendas** (⋯ → Funil de vendas). Um quadro com uma coluna para cada etiqueta de venda (Novo cliente, Reserva, Aguardando pagamento, Pago, Enviado — as mesmas de Etiquetas; se a equipe renomear ou arquivar, o quadro acompanha). Cada cartão é uma pessoa: nome, canal, prévia, há quanto tempo e responsável. Respeita a aba de canal (Todas, WhatsApp 1, WhatsApp 2, Instagram).
- Mover o cartão troca só a etapa da venda da pessoa; as outras etiquetas (ex.: Troca) ficam. No celular: uma coluna por tela (deslize ou use ‹ ›) e toque no cartão para “Mover para…”, “Tirar do funil” ou “Abrir conversa”. No computador: colunas lado a lado, arrastar e soltar, ou clicar/Enter no cartão para o mesmo menu.
- Servidor: `GET /msg/funil?canal=` (só conversas individuais abertas; a pessoa com vários canais aparece uma vez, pela conversa mais recente; até 30 cartões por coluna, com o total) e `POST /msg/funil/mover` (`etiqueta: 0` tira a etapa). Erros em português.

## 7.40.14 — 28/10/2026
- Mensagens: **Ficha do cliente** — toque no nome/avatar da conversa (ou ⋯ → Ficha do cliente…). Num só lugar: tamanhos que a cliente usa (atalhos PP a GG e 36 a 46 + texto), preferências, cidade/bairro, etiquetas (com “Mudar etiquetas”), as 5 notas internas mais recentes, compras (conversas encerradas como “Vendeu”, com data e canal) e os canais vinculados (WhatsApp 1/2/Instagram, com “Abrir”).
- A ficha é da pessoa: vale para todos os canais vinculados, como notas e etiquetas. Só mostra o que existe (“Nenhuma compra registrada ainda”). A faixa da conversa mostra discretamente “Veste M · 38”.
- Servidor: tabela `msg_ficha`, `GET/POST /msg/ficha` (tamanhos até 60 letras, preferências até 300, cidade até 60; erros em português). Um “Vendeu” corrigido logo depois (sem mensagem no meio) não conta como compra.

## 7.40.13 — 28/10/2026
- Mensagens: **Agendar mensagem** (menu ⋯ da conversa). Escreva agora e escolha “Daqui a 1 hora”, “Amanhã 8h”, “Amanhã 14h” ou o dia e a hora (horário de Fortaleza); o servidor envia sozinho na hora marcada, sem duplicar.
- A conversa mostra uma faixa “1 mensagem agendada para amanhã 08:00 · Ver”; dá para cancelar antes de sair, e falhas ficam registradas com o motivo.

## 7.40.12 — 28/10/2026
- Mensagens: filtro **Retomar** — clientes que pararam de responder (última mensagem foi da loja) ou com etiqueta Reserva/Aguardando pagamento, parados entre 1 e 30 dias. Use o atalho /retorno para chamar de volta.
- Meta de resposta: cliente esperando há mais de 15 min aparece em vermelho na lista, com ⚠.

## 7.40.11 — 28/10/2026
- App Mensagens: abre na hora com o login guardado no aparelho (a conferência com o servidor de contas segue por trás) e mostra as conversas salvas enquanto atualiza.
- Menu ⋯ no app Android 2.4.3: Atualizar app e Permissões do app.

## 7.40.10 — 28/10/2026
- App Mensagens: o Voltar do celular, numa conversa aberta pelo aviso, volta para a lista de conversas em vez de mandar o app para o fundo.

## 7.40.9 — Respostas automáticas e atalhos — 2026-10-28

- Mensagens → Respostas: 11 atalhos prontos (/oi, /preco, /foto, /tamanho, /entrega, /outracidade, /pix, /endereco, /retorno, /obrigado, /saiu), semeados uma vez sem apagar as respostas que a equipe já tinha. Escrever "/oi" e espaço na mensagem coloca o texto; [nome] vira o nome da atendente; o primeiro [colchete] fica selecionado e o envio é bloqueado enquanto houver [valor…], [chave Pix] ou [nome] sem completar. O /pix vem com [chave Pix] e [nome] para a loja completar no app (nada da chave fica no código).
- Mensagens → ⋯ → **Respostas automáticas…** (desligadas por padrão): Boas-vindas (loja aberta, conversa parada havia 12 h, uma vez) e Fora do horário (loja fechada, no máximo 1 vez por período fechado, com {abertura} = "hoje às 7h30", "amanhã às 7h30", "segunda às 7h30", "amanhã às 8h"…). Horário de Fortaleza: seg–sex 7h30–18h, sáb 7h30–14h, domingo fechado; feriados com comércio aberto (8h–13h) editáveis no app. Fora do horário não sai se alguém da equipe respondeu nos últimos 30 min.
- Nunca em grupos, respostas a status sem texto, reações ou mensagens da loja. Sai pela mesma função do "Enviar", com o selo "Automática" na conversa; não vira responsável, não tira a conversa de "Falta responder" e não conta nas métricas de demora. Falha de envio não derruba o webhook e aparece no diagnóstico da gaveta.
- Servidor: `GET/POST /msg/auto`, tabela `msg_auto_envio` (não repetir), cfg `msg_auto`, `msg_auto_diag` e `msg_resp_semeada`. Testes: `worker_mensagens_conversa` 320, `worker_mobile_push` OK.

## 7.40.8 — 28/10/2026
- App Mensagens: a tela não fica mais em branco com a barra Catálogo/Gestão depois do Voltar; se a janela fechar, ela reabre sozinha.
- App Android 2.4.1: a tela carregada fica guardada enquanto o app vive em segundo plano.

## 7.40.7 — Trocar usuário — 2026-10-28

- Mensagens → ⋯ → **Trocar usuário…**: mostra as contas já usadas neste aparelho, com "Usar" para trocar com um toque, "Esquecer" para tirar da lista e "Entrar com outra conta". Trocar não apaga as conversas carregadas. Vale no site e no atendimento do app.

## 7.40.6 — Responsável pela conversa — 2026-10-28

- Quem responde primeiro uma conversa sem responsável vira o responsável, automaticamente.
- Conversa: "Responsável: Pablo" com Liberar, ou o botão Assumir, na faixa abaixo do cabeçalho.
- Lista: "Resp.: Pablo" em cada linha e o filtro **Minhas**.
- Servidor: coluna `dono` em `msg_conversa`, `POST /msg/dono` e `filtro=minhas`. O nome é o de "Respondendo como". Teste: `worker_mensagens_conversa` 277.

## 7.40.5 — Diagnóstico de status no WhatsApp 1 — 2026-10-28

- Servidor: guarda o formato (só nomes de campos e se veio sinal de resposta a status) do último texto comum de cada WhatsApp, para comparar o WhatsApp 1 (respostas a status chegando sem a referência) com o WhatsApp 2 (chegando certo).

## 7.40.4 — Etiquetas nas conversas — 2026-10-28

- Conversa: faixa logo abaixo do cabeçalho com as etiquetas da pessoa e "+ Etiqueta". A gaveta tem a **etapa da venda** (uma por vez: Novo cliente, Reserva, Aguardando pagamento, Pago, Enviado) e **outras** (Troca), com Salvar.
- Lista: até duas etiquetas em cada linha (ponto de cor + nome) e uma fileira de filtros por etiqueta, com a contagem de pessoas.
- As etiquetas valem para a pessoa, somando os canais vinculados.
- Servidor: tabelas `msg_etiqueta` e `msg_alvo_etiqueta`, `GET /msg/etiquetas` (cria as padrão na primeira vez), `POST /msg/rotular` e `etiqueta=` em `/msg/conversas`. Teste: `worker_mensagens_conversa` 275.

## 7.40.3 — Nota interna na conversa — 2026-10-28

- Conversa: botão **Nota** na barra (ao lado de Produtos e Respostas). Com ele ligado, a caixa fica amarela e o texto vira nota interna, que só a equipe vê; nada é enviado ao cliente.
- A nota aparece no fio como cartão amarelo de largura total, com "Só a equipe vê · autor · hora", e vale para todos os canais vinculados da pessoa.
- Servidor: tabela `msg_nota`, `POST /msg/notas` e as notas junto com `/msg/mensagens`. Teste: `worker_mensagens_conversa` 271.

## 7.40.2 — Aviso quando as mensagens param de chegar — 2026-10-28

- Mensagens: faixa vermelha no topo da lista ("Mensagens não estão chegando desde HH:MM") quando o servidor recusa os avisos do WhatsApp ou do Instagram, como no limite do banco em 27/10. Some sozinha quando uma mensagem volta a ser gravada.
- Servidor: marca a falha no KV só quando um aviso falha (no máximo uma gravação a cada 20 s); a tela confere a cada ~40 s, junto com os contadores. Precisa de 2 falhas para avisar, para um erro isolado não acender a faixa.

## 7.40.1 — Conversa mais limpa — 2026-10-28

- "Foi resposta a um story? Ver stories no ar" aparece só na última mensagem recebida sem contexto, e não mais embaixo de cada mensagem.

## 7.40.0 — APK 2.3: pessoas, contatos e contexto real de stories — 2026-10-28

- Não lidas e Falta responder usam a mesma base ativa: pendente inclui toda não lida mais leitura sem resposta; encerradas ficam fora. Contadores identificam pessoas, reunindo canais explicitamente vinculados. Grupos começam desligados e podem ser ligados manualmente.
- Canais de uma pessoa ficam juntos, ordenados internamente pela última mensagem; o bloco sobe pela atividade mais recente. Canais secundários têm apresentação compacta. Aba Nos 2 WhatsApp removida.
- Cabeçalho da conversa abre cadastro com nome, WhatsApp principal/segundo número e vínculo com conversas do Instagram/WhatsApp, sem juntar por nome parecido. Mensagens e histórico de cada canal são preservados.
- Índice privado dos nomes do Google Contatos por telefone normalizado. A importação existente alimentava relatório/limpeza, sem indexar nomes no atendimento; novo fluxo apenas lê Google e resolve nomes no servidor. Nome confirmado manualmente tem prioridade.
- Wafly: referências dentro de texto/contexto, mídia citada e correlação pelo ID de status/publicação. Captura de status próprio quando o provedor entrega o callback. Contexto disponível tem prioridade sobre candidato; aproximação é rotulada.
- Instagram/Zernio: storyReply do webhook/metadados ou lista de mensagens, correspondência por IDs, MIME de vídeo salvo diretamente e recuperação limitada de contexto antigo disponível no provedor. Sem resposta enviada/confirmada como efeito de consulta.
- APK com conversa sem cabeçalho duplicado, bolhas adaptáveis, datas, prévias autenticadas e vídeo interno. Produtos em janela ampla com linhas de altura variável, fotos maiores, ordenação por código recente e ações por peça/seleção.
- APK 2.3.0/code6 mantém assinatura anterior e atualizador verificado. Testes simulados e revisão estética documentados; codecs/teclado/FCM/instalação ainda exigem conferência física.


## 7.39.0 — APK 2.2: seleção e ferramentas completas do atendimento — 2026-10-27

- Corrige toque prolongado consumido pelos controles da linha. Texto, avatar e Espiar selecionam a conversa sem abri-la; botão Selecionar visível e barra com Encerrar/Lidas/Mais. Sincronização não interrompe gesto nem desloca a linha durante a seleção.
- Painel de atendimento e gráfico por hora, configurações de leitura/nome/assinatura, exportação TXT/CSV/JSON e cópia para IA passam a funcionar na tela nativa pelas rotas existentes.
- Conexões WhatsApp/Instagram, diagnósticos, pausa e retomada, segredo/assinatura Meta e ponte Google Contatos (cópia, relatório somente leitura e desligamento) disponíveis no menu nativo. Alterações exigem ações explícitas.
- Produtos com fotos, estoque, busca sem acentos, seleção persistente e links; contexto de stories publicados; histórico anterior além da janela local e botão de novas mensagens. Avisos locais podem ser descartados sem reenviar.
- Integra as mudanças simultâneas até 7.38.2 sem perda: prévia de links no compositor e contatos por partes com progresso/parada/tela acesa.
- APK 2.2.0/code5, mesma assinatura. 38 testes Android simulados; lint Release sem erros. Não envia mensagens ou muda conexões reais como teste.
## 7.38.2 — Conferir as entregas do Zernio — 2026-10-27

- Conexões → Instagram Direct · Zernio: botões **"Conferir entregas"** e **"Testar aviso"**. O servidor pergunta ao próprio Zernio se o aviso de mensagens está ativo, se aponta para este servidor e para o Instagram da loja, e mostra as últimas 10 entregas com o resultado (ex.: "failed (HTTP 404)"). "Testar aviso" pede ao Zernio um aviso de teste e confere se ele chegou aqui.
- Motivo: às 18:12 de 27/10, as DMs novas (respostas a story e "Oi") não chegaram ao servidor; o último aviso recebido foi às 17:57.
- Worker: `POST /msg/zernio/config {diagnostico|testar}` (`GET /v1/webhooks/settings`, `/v1/webhooks/logs`, `POST /v1/webhooks/test`); nunca devolve chave nem segredo.
- Testes: `worker_mensagens_conversa` 247, `conexoes_zernio` 30. SW tk-3.38.23.

## 7.38.1 — Aviso no celular na hora para DM do Instagram — 2026-10-27

- O aviso no celular (app Android) de uma DM nova do Instagram sai assim que o Zernio entrega a mensagem, como já era no WhatsApp. Antes ele ficava na fila esperando a rodada de 1 minuto, e a primeira DM real (27/10, 17:57) ficou sem aviso.
- Medição da primeira DM real: o Zernio leva de 7 a 9 s para avisar o nosso servidor; o nosso servidor grava em menos de 1 s; o site confere a cada 4 s e o app a cada 8 s com a tela aberta.
- Teste: `worker_mobile_push` (DM avisa sem esperar o cron; resposta da loja não avisa).

## 7.38.0 — Cofre mostra também as chaves do servidor das Mensagens — 2026-10-27

- O "Cofre das chaves" (Conexões) passa a listar e copiar as chaves guardadas no servidor das Mensagens: **Zernio**, Wafly 1 e 2 (instância e tokens), Wame, Gemini, FreeConvert, ponte do Google Contatos e chave do aplicativo Android. Mostra só o final de cada uma; a chave continua indo direto para a área de transferência, nunca para a tela.
- Mesma dupla verificação: o servidor repassa a senha ao Apps Script e usa o mesmo código de abertura de 5 minutos. Senha errada conta uma vez só; com o servidor fora do ar, o cofre abre só com as chaves do Apps Script. Trancar ou fechar a janela tranca os dois.
- Instagram Direct · Zernio: novo botão **"Ligar mensagens do Direct"** quando a chave e o Instagram já estão guardados mas o aviso de mensagens está desligado. Usa a chave guardada, sem precisar colar de novo.
- Botão "Copiar" sem chave fica cinza (antes parecia ativo).
- Worker: rotas `/cofre/itens`, `/cofre/abrir`, `/cofre/revelar` e `/cofre/fechar` (só quem gere acessos; código conferido em tempo constante; até 30 cópias em 10 min; registra quem copiou, sem o valor).
- Service worker renovado (tk-3.38.22).

## 7.37.0 — Instagram Direct nas Mensagens pelo Zernio — 2026-10-27

- Ao salvar a chave (ou escolher o Instagram) em Conexões, o servidor liga no Zernio o aviso de mensagens novas, só para o Instagram da loja, com senha própria (assinatura HMAC-SHA256).
- As DMs entram em Mensagens → Instagram com o nome do cliente. Fotos, vídeos, áudios e a menção da loja no story do cliente são copiados para o nosso armazenamento.
- **Story respondido:** o servidor busca no Zernio qual story o cliente respondeu. Se foi publicado pelo site, a conversa mostra a nossa foto (e o produto, quando escolhido); se não, copia a imagem do story antes de o link vencer.
- Responder pelo painel sai pelo Zernio, na conversa certa. Passadas 24 h, tenta de novo com a marcação de atendimento humano da Meta (vale até 7 dias, só para resposta digitada por pessoa). Respostas dadas pelo app do Instagram também aparecem na conversa.
- Conexões mostra "mensagens do Direct ligadas" e a hora do último aviso; remover a chave desliga o aviso no Zernio.
- Worker: rota `/wh/zernio/<segredo>` (responde na hora e grava em segundo plano), tabela `msg_zernio_conv` e envio por `POST /v1/inbox/conversations/{id}/messages`.
- Service worker renovado (tk-3.38.21).

## 7.36.0 — Google Contatos: limpeza aprovada e cadastro automático "TM Cliente" — 2026-10-27

- No relatório, o botão **"Aplicar a limpeza aprovada"** faz tudo em 5 etapas, com a faixa de progresso, a tela acesa e o aviso antes de sair:
  1. cópia de segurança nova (em partes);
  2. leitura dos contatos (relatório novo, com o plano completo);
  3. juntar as pessoas repetidas (fica o contato de nome mais completo; os outros nomes vão para a observação "Também salvo como: …"; telefones e e-mails de todos ficam no que fica);
  4. padronizar os números (+55 e o 9 do celular; 9 dígitos sem DDD ganham o 88; fixo não ganha o 9; número estrangeiro não muda);
  5. criar quem conversou no WhatsApp e não está no Google como **"TM Cliente nome do WhatsApp"** (ou o número) no marcador "Tenkiter Clientes G".
- Ao terminar, liga o **cadastro automático**: cada número novo que escreve no WhatsApp entra numa fila e, a cada minuto, até 5 viram "TM Cliente …" no Google (sem duplicar). Liga e desliga em Configurações → Google Contatos.
- Worker: plano completo em `msg_contatos_plano` (repetidos ligados entre si viram um grupo só), `/msg/contatos/limpeza` por etapas (exige cópia com menos de 6 horas), fila `msg_contatos_fila` e `/msg/contatos/auto`. 9 dígitos sem DDD passam a valer como DDD 88 no relatório.
- Pede a ponte 1.2 (`juntar_lote`, `padronizar_parte`, `criar_lote`, com as chamadas em lote do Google).
- Conexões → Zernio: com mais de um Instagram conectado, o servidor prefere o da loja (nome com "tenkiter") e a tela mostra "Qual Instagram é o da loja?" para escolher (`listar`/`escolher` usam a chave já guardada).
- Service worker renovado (tk-3.38.20).

## 7.35.0 — Chave do Zernio em Conexões e Google Contatos para contas grandes — 2026-10-27

- Gestão → Conexões → Instagram ganhou o bloco "Instagram Direct · Zernio": passo a passo curto, campo de senha para a chave de API e os botões "Salvar e conferir" e "Remover chave".
- O servidor confere a chave listando as contas no Zernio (nada é enviado) e mostra qual Instagram está conectado. A chave fica só no servidor (`zernio_chave`) e nunca volta para a tela.
- Nesta etapa só guarda a chave; as DMs do Instagram entram nas Mensagens na próxima versão.
- Botões da tela Conexões com 44 px de altura (eram 40).
- Google Contatos: o andamento e o resultado de ligar, cópia de segurança e relatório ficam escritos dentro do quadro (antes era um aviso que sumia em 9 segundos, e a cópia pode passar de um minuto).
- Google Contatos para contas grandes (15 mil+ contatos):
  - a cópia de segurança sai em partes pela ponte 1.1 (`backup_parte`): arquivos `parte-NN.json` numa subpasta de "TENKiTER backups";
  - o relatório lê uma página por vez (`etapa: inicio/parte/fim`) e guarda só o necessário numa tabela temporária, apagada no fim;
  - faixa fixa no pé da tela com o progresso ("5.000 de 15.300 contatos"), tela acesa (Wake Lock, quando o aparelho deixa), aviso antes de sair da página e confirmação ao fechar as Mensagens; botões dos contatos travados enquanto roda; sem rede, a mesma parte é tentada de novo até 3 vezes.
- Teste `conexoes_unificada` atualizado para o grupo Android (7 grupos).
- Service worker renovado (tk-3.38.19).

## 7.34.0 — Mensagens: prévia do link escolhida em cada mensagem — 2026-10-27

- No WhatsApp, quando a mensagem tem link, aparece logo acima do campo a caixinha "Mostrar prévia do link (miniatura)". A última escolha de cada canal fica lembrada no aparelho; começa desmarcada.
- Marcada, a mensagem sai pelo envio "link com prévia" da Wafly (`/send-link`), usando o primeiro link do texto. O cartão leva o nome e o preço da peça, "Peças separadas para você" numa seleção ou o nome da loja nos links do site. Link de fora fica com o que o WhatsApp encontrar.
- Desmarcada, ou sem link, tudo continua como antes (texto simples). No Instagram a caixinha não aparece.
- Worker: `/msg/enviar` aceita `previa`, `previaTitulo` e `previaDescricao` (limpos e cortados em 100/200 letras).
- Service worker renovado (tk-3.38.18).

## 7.33.1 — Manifesto do atualizador Android sem cache — 2026-10-27

- Corrige entrega do manifesto 2.0.1 após publicação do APK 2.1.0: configura no-store na origem Render, preservando as demais regras de cabeçalho.
- Deploy passa a conferir no endereço público versão, código, tamanho, SHA, URL do APK e proibição de cache. A versão do site sozinha deixa de ser evidência de que o botão oferece o APK certo.
- Mantém APK 2.1.0/code4 e sua assinatura; não exige outro instalador.


## 7.33.0 — APK 2.1: atendimento nativo e notificações informativas — 2026-10-27

- Lista nativa com canais e contagens locais, grupos/individuais, não lidas, falta responder com tempo de espera, nos dois WhatsApp e encerradas. Contato formatado, indicação de respostas da loja e seleção de até 50 conversas por menu ou toque longo.
- Espiar mantém a conversa não lida; só a abertura normal em primeiro plano confirma leitura, respeitando a configuração de leitura no celular do canal. Ações em lote usam as rotas existentes de leitura, encerramento com motivo e reabertura.
- Produtos e seleções com preços compatíveis com o catálogo, respostas rápidas editáveis para toda a equipe e assinatura conforme configuração do site.
- Fotos/contextos abrem no app; outros anexos no visualizador Android. Envio de foto/vídeo/áudio e gravação AAC com revisão, sem reenvio automático. URLs de mídia e credenciais não entram no banco local.
- Notificações com nome, canal, trecho/tipo da mensagem, ações Espiar/Abrir e privacidade de tela bloqueada. Tarefa antiga consulta a mensagem mais recente; notificações de conversas já lidas/encerradas são descartadas.
- Paginação estável por data+ID e sincronização incremental; primeiro cursor preservado durante a carga inicial. APK 2.1.0/code 4 com a assinatura anterior, disponível pelo atualizador.


## 7.32.1 — APK 2.0.1: caixa de conversas mais clara — 2026-10-27

- Explica a ordem por última mensagem, mostra horário/ontem/data, preserva a ordem temporal também no filtro Não lidas e usa desempate estável por ID.
- Faixa compacta com Todas, Não lidas e seletor de canal; busca e sincronização na mesma linha, sem título duplicado.
- Não lidas são identificadas por texto e nome em negrito; singular correto; tipos de mídia ficam legíveis.
- Atualização assinada com a mesma chave, disponível pelo botão Atualizar app.


## 7.32.0 — APK Mensagens 2.0 e distribuição de atualizações — 2026-10-27

- Nova caixa Android nativa com banco SQLite, leitura local, filtro, busca e resposta de texto. Histórico mais antigo e anexos seguem acessíveis em Completo.
- Sessão cifrada com Android Keystore; logout/troca de conta removem o banco anterior. Sincronização por extensão de notificação OneSignal e WorkManager, com tarefa periódica de recuperação.
- Botão Atualizar app consulta android/latest.json, baixa a release oficial, confere hash/tamanho/package/versão/assinatura e abre o instalador Android com confirmação do usuário.
- APK 2.0.0 assinado com a mesma chave da 1.0.0; instalação inicial sobre a anterior é manual. Próximas versões podem usar o botão interno.
- CI Android passa a executar testes Robolectric, revisão lint e compilação; procedimento de publicação/backup documentado.


## 7.31.0 — Mensagens: push imediato e abertura com recentes — 2026-10-27

- Webhooks de mensagens novas disparam a fila Android em segundo plano, sem aguardar o cron. O cron permanece como recuperação; os IDs idempotentes e a validação de sessão continuam ativos.
- No APK, lista e resumo carregam em paralelo. Produtos, categorias e estatísticas do catálogo deixam de competir pela rede na abertura; Produtos carrega ao abrir sua gaveta.
- Lista e até 80 mensagens por conversa ficam em cache local, por conta/sessão, por até 24 horas (dez consultas, máximo 500 mil caracteres). Anexos, URLs de mídia e tokens não entram nesse cache.
- Conversas salvas aparecem em modo de leitura até o servidor confirmar os dados. Sair ou receber recusa de acesso limpa o cache; falha de rede preserva a leitura local.
- Funciona no APK 1.0.0 existente, sem reinstalação. Primeira carga da página e confirmação de login ainda exigem rede.


## 7.30.2 — Validar vídeos ao escolher arquivos — 2026-10-27

- Vídeos fora dos limites de Status são recusados já na seleção, tanto em Livre quanto em mídias avulsas, antes de entrar na lista.
- Mudar o destino para Status confere também os vídeos já escolhidos e informa o problema sem apagá-los do rascunho.
- O rótulo da seleção acompanha o destino: Status até 30 s/10 MB; demais canais preservam seus limites.


## 7.30.1 — Limites dos vídeos no WhatsApp Status — 2026-10-26

- Antes de agendar, vídeos para Status 1 e 2 são conferidos: até 30 segundos e 10 MB. O rascunho permanece disponível para substituir os arquivos.
- O Worker também lê a duração do MP4 antes de enviar à Wafly, e diferencia o limite de imagem (5 MB) do de vídeo (10 MB).
- O HTTP 422 passa a explicar os formatos e limites exigidos, em vez de mostrar apenas uma recusa genérica.
- Limites de grupo e Instagram continuam independentes. Nenhum item cancelado foi reativado.


## 7.29.0 — Mensagens: selecionar várias peças e mandar a seleção — 2026-10-26

- Na gaveta Produtos da conversa, tocar na foto marca a peça (✓ e linha destacada); a seleção continua ao trocar a busca.
- A barra embaixo mostra quantas peças estão marcadas, com "Limpar", "Copiar link" e "Enviar seleção".
- "Enviar seleção" põe na mensagem o mesmo texto do "Selecionar" da loja: cada peça com código e preço à vista e o link `?sel=` do site, que abre só essas peças. Até 60 peças.
- A seleção vale para a conversa aberta e recomeça ao enviar ou trocar de conversa.
- Service worker renovado (tk-3.38.17).

## 7.28.0 — Google Contatos: ligar a ponte, cópia de segurança e relatório da primeira limpeza — 2026-10-26

- Mensagens → ⋯ → Configurações → "Google Contatos (marcador Tenkiter Clientes G)": liga a ponte (`contatos-ponte-1.0`, Apps Script publicado na conta dos contatos), faz a cópia de segurança no Drive daquela conta e gera o relatório da primeira limpeza.
- O relatório mostra pessoas repetidas pelo número, números a padronizar, números inválidos, contatos sem número e quem conversou no WhatsApp e não está no Google. Só lê: nada muda no Google nesta etapa.
- Worker: rotas `/msg/contatos/*`. O endereço e a chave da ponte ficam só no servidor.
- A caixa de Configurações rola por dentro.
- Service worker renovado (tk-3.38.16).

## 7.27.0 — Mensagens: motivo ao encerrar — 2026-10-26

- Encerrar pergunta o motivo:
  - **Concluído** (padrão) e **Vendeu**: contam como atendimento resolvido na hora;
  - **Cliente parou de responder**: também conta como resolvido e fica no histórico do cliente;
  - **Engano ou spam**: fica fora das métricas.
- O motivo aparece na lista de encerradas e na faixa da conversa. O painel de atendimento soma os encerramentos por motivo.
- Worker:
  - coluna `encerrada_motivo` e tabela `msg_encerramento` (histórico), criadas sozinhas;
  - `/msg/encerrar` com `motivo`;
  - métricas usam os encerramentos;
  - "esperando resposta" ignora conversas encerradas.
- Service worker renovado (tk-3.38.15).

## 7.26.0 — Foto entra inteira no quadro (Encaixar como padrão) — 2026-10-26

- Cadastro (um produto e vários): toda foto nova que não está em 4:5 entra **inteira** no quadro do site (1080×1350), com o fundo desfocado da própria foto nas sobras. Nada fica escondido pelo corte, como acontecia com capturas de tela compridas.
- ✂ Enquadrar continua opcional (zoom, corte, giro). "Voltar à original" leva à foto encaixada padrão, já enviada.
- Fotos de peças já cadastradas não mudam sozinhas.
- Service worker renovado (tk-3.38.14).

## 7.25.0 — Enquadrar abre mais rápido (e o painel fica mais leve) — 2026-10-26

- "✂ Enquadrar" abre em cerca de metade do tempo num celular simples: de ~1,5 s para ~0,7 s no teste com 540 peças.
  - A foto é decodificada fora da tela (`createImageBitmap`) antes do primeiro desenho.
  - O fundo desfocado é calculado uma vez por foto.
  - A janela não trava mais a rolagem do documento inteiro.
- Painel e todas as páginas: os vigias de acessibilidade (`a11y.js`), de ícones dos títulos e dos grupos de ferramentas olham só o que mudou, sem varrer a página inteira a cada alteração. O comportamento é o mesmo.
- Service worker renovado (tk-3.38.13).

## 7.24.0 — Mensagens para o atendimento: produtos, respostas rápidas, filtros Mensagens/Grupos e seleção — 2026-10-26

- Filtros da lista:
  - "Mensagens" e "Grupos" no lugar de "Todas", ligados juntos (tudo) ou cada um sozinho;
  - saiu "Lidas";
  - "Não lidas", "Falta responder", "Nos 2 WhatsApp" e "Encerradas" desligam com um novo toque.
- Seleção com **Marcar lidas** (também no celular, quando o canal está com a opção ligada), **Não lidas** (só no painel) e **Encerrar**.
- "Nos 2 WhatsApp": a conversa encerrada não conta; a pessoa sai do filtro e volta quando escreve de novo na encerrada.
- Na conversa:
  - nova barra com **Produtos** e **Respostas**;
  - Produtos: busca no catálogo, com foto, preço à vista, tamanhos e estoque, e "Colocar na mensagem" (nome, preço, tamanhos, cores e link da peça);
  - Respostas rápidas: começam com endereço, catálogo e Instagram, e a loja edita para toda a equipe.
- Negrito, itálico e riscado do WhatsApp aparecem formatados; a prévia da lista sai sem asteriscos.
- Cartão de contato com nome e número, e localização com nome e endereço.
- Worker:
  - `/msg/conversas` com `tipo` (individual/grupo) e `tipos` (contagens);
  - `/msg/lida` com `conversas` (em lote);
  - `/msg/config` com `respostas`;
  - `outro_id` ignora conversas encerradas.
- Service worker renovado (tk-3.38.12).

## 7.23.0 — Cadastro: "Cadastrar UM produto" e "Cadastrar vários produtos" — 2026-10-26

- Menu Cadastrar com nomes que não se confundem:
  - "Cadastrar UM produto" (até 8 fotos e 3 vídeos, tudo no mesmo produto);
  - "Cadastrar vários produtos" (cada foto vira um produto, com o mesmo título, valor, tamanho e cor).
- Cada cartão tem um desenho pequeno: 3 fotos → 1 produto, ou 3 fotos → 3 produtos.
- Modo "vários produtos":
  - título e botão com o novo nome;
  - passo 1 "Fotos · uma por produto", com a contagem em produtos;
  - sem o "★ CAPA" e sem a dica de capa, que não se aplicam.
- Selo "novos" do Cadastrar legível (preto no laranja). Service worker renovado (tk-3.38.11).

## 7.22.0 — Mensagens: número do cliente, mesma pessoa nos 2 WhatsApp, encerrar conversas e nome do atendente — 2026-10-26

- Conversas que mostravam "tenkitermodas" ou "Tenkitermodas Reserva" (o nome do próprio WhatsApp da loja, gravado quando a primeira mensagem saía do celular) voltam a mostrar o número. Quando o cliente escrever, aparece o nome que ele colocou no WhatsApp. Mensagem enviada pela loja não dá mais nome à conversa.
- O número do cliente aparece sempre: sem nome, no lugar do nome e formatado; com nome, numa linha pequena junto da etiqueta do canal.
- Mesma pessoa nos dois WhatsApp (comparando com e sem o 9º dígito): sinal "Também no WhatsApp 2/1" na lista, faixa com "Abrir" na conversa e filtro "Nos 2 WhatsApp", em laranja quando há alguém.
- Encerrar conversas: uma pelo ⋯ da conversa, ou várias por ⋯ → "Selecionar conversas" (ou segurando o dedo numa conversa). Encerradas vão para o filtro "Encerradas", saem das contagens e voltam sozinhas quando o cliente escreve de novo. Dá para reabrir à mão.
- Nome do atendente antes da resposta: ligado por padrão, com o primeiro nome do cadastro ("*Ana:*" em negrito no WhatsApp; "Ana:" no Instagram). Cada atendente pode escrever o nome que quer ("Respondendo como Ana · Mudar nome", acima da caixa de mensagem). O Admin liga e desliga para todos em ⋯ → "Configurações (leitura e nome)…". A bolha enviada mostra o nome como rótulo.
- A busca da tela de Mensagens passava 24 px da coluna; corrigido.
- Worker: colunas `pessoa` e `encerrada_em` (criadas sozinhas), `outro_id` na lista, filtros `ambos` e `encerradas`, contagens `ambos`/`encerradas`, a rota `/msg/encerrar` e `/msg/config` com `assinatura` e `meuNome` (o nome de cada atendente). Service worker renovado (tk-3.38.10).

## 7.21.0 — Mensagens: aba Todas, Espiar e leitura no celular; aviso de versão nova — 2026-10-26

- Mensagens: aba mestre "Todas" (WhatsApp 1, WhatsApp 2 e Instagram juntos), que é a que abre, com a etiqueta do canal em cada conversa. Novo filtro "Lidas" ao lado de "Não lidas".
- "Espiar" nas conversas não lidas: mostra as mensagens sem marcar como lida, nem no painel nem no celular oficial. Uma faixa avisa que está espiando, e "Atender" libera a resposta e marca como lida.
- Abrir uma conversa normalmente passa a marcar como lida também no celular oficial: WhatsApp pela Wafly (`modify-chat`, e `read-message` se ele não for aceito) e Instagram com o "visto". Antes o site nunca confirmava a leitura no aparelho.
- Configuração em ⋯ → "Leitura no celular…": liga e desliga por canal e mostra o resultado da última tentativa. Se o celular não confirmar, aparece um aviso uma vez por canal.
- Avisos da tela de Mensagens viraram um aviso flutuante: no celular, ficavam escondidos enquanto a conversa estava aberta.
- Todas as páginas: quando sai uma versão nova do site com a página aberta, aparece a faixa "Saiu uma versão nova do site · Atualizar". Ela nunca recarrega sozinha.
- Worker: `/msg/conversas?canal=todos`, filtro `lidas`, `/msg/lida` com `celular:true` e `/msg/config`. Service worker renovado (tk-3.38.9).

## 7.20.0 — Mensagens: quem mandou cada mensagem no grupo — 2026-10-26

- Grupos do WhatsApp na tela de Mensagens: cada mensagem mostra quem mandou (nome do WhatsApp e número; sem nome, só o número), com uma cor por pessoa, como no WhatsApp. Antes não dava para saber quem tinha escrito.
- Menções "@266124864270572" viram "@Nome" quando a pessoa já falou no grupo.
- Grupo não mostra mais "Foi resposta a um story? Ver stories no ar" em toda mensagem; nas conversas individuais continua.
- Worker de mensagens: grava o autor das mensagens de grupo (colunas `autor_nome`, `autor_fone` e `autor_lid`, criadas sozinhas). A prévia da conversa mostra "Nome: texto" e a exportação mostra o nome no lugar de "cliente".
- Vale para mensagens que chegarem depois da publicação: as que já estavam gravadas não têm o autor, porque ele não era guardado.

## 7.19.0 — Ferramentas do gestor reorganizadas — 2026-10-26

- Ferramentas em grupos (Vendas e clientes, Conteúdo, Planilha e histórico, Sistema), cada uma com ícone, título e uma linha dizendo para que serve. Antes eram onze botões de cores diferentes. Os botões e as permissões continuam os mesmos, e o grupo some quando a pessoa não tem nenhuma ferramenta dele.
- Números do topo no padrão do painel. "Peça mais vista" mostra o código e o nome da peça; antes aparecia "Ver produto" sem ser link quando a peça não tinha código.
- Pedidos com cabeçalho neutro (era laranja forte) e o botão Atualizar com ícone.
- Janelas (Auditoria, Central de avisos, Números reais, Importar, Postagens, Fotos com IA, Mensagens, Conexões) com o mesmo cabeçalho: ícone no título, botão fechar de 44 px e abas com a escolhida em preto.
- Campos de busca, data, telefone e senha com 44 px em todo o painel. Na Auditoria, a busca tinha 22 px.
- Importar planilha: botão "Escolher arquivo" em português, mostrando o nome do arquivo (o navegador mostrava "Choose File").
- Números reais: cartões sem emoji e com o número em preto.
- Configurações avançadas e Log em blocos com título; ação principal preta e secundária com borda, lado a lado no computador.
- Painel: modos do "Editar peças" e opção marcada do "Alterar preços" em preto; formulário com ícone nos botões de foto e vídeo, o passo "9 Descrição e destaque" e o Cancelar com borda.
- Páginas da equipe no mesmo padrão (`acabamento-equipe.css`): Currículos, Treinamentos e Painel do RH (o modo escuro continua) e o formulário público "Trabalhe com a gente".
- Privacidade e Exclusão de dados no mesmo padrão; o service worker guarda `acabamento-equipe.css` (tk-3.38.8).
- Loja, acessibilidade: a lista de sugestões da busca tinha botões de "Refinar" e o link do WhatsApp dentro da lista anunciada ao leitor de tela, o que é inválido. Agora só as opções ficam na lista; "Ver as N peças" passa para antes do Refinar.
- Testes antigos atualizados para a loja e os manuais atuais: `filtros_facetas` e `filtros_v66` (chips com contagem), `filtro_menu_rolagem` (o corpo do painel é que rola), `selecao_vida`, `manual_rico` e `modulo0_verificado`.

## 7.18.0 — "Editar peças" rápido e filtro por valor — 2026-10-26

- "Editar peças" (só dados, sem foto) salva todas as peças numa chamada só (`updateLote`, servidor catálogo 4.28). Antes era uma chamada completa por peça, e 20 peças demoravam o mesmo que 20 cadastros com foto. Se uma peça for recusada, só ela fica com erro e "Tentar de novo"; se o grupo não passar (rede, servidor antigo), cada peça segue pelo envio normal. Com o servidor 4.27, nada muda.
- "Escolher peça para copiar": filtro por valor (cada valor cadastrado com a contagem; "Consultar valor" por último) e ordem "Menor valor" / "Maior valor".

## 7.17.0 — acabamento novo no painel de gestão (Opção A) — 2026-10-26

- Painel no mesmo padrão da vitrine (`acabamento-admin.css`): ícones de linha no lugar dos emojis em "O que fazer agora", Cadastrar, busca, Filtros, cartão da peça, menu ⋯ e barra de seleção; cantos de 6–8 px, bordas finas, sem sombra, escolha marcada em preto.
- Cabeçalho de uma faixa (58 px) com a marca à esquerda; faixa do CPF e conteúdo com a mesma largura no computador (antes ia de ponta a ponta).
- Cartão da peça: Editar como botão principal e Stories/Link/Postar em grade 2×2 no celular, todos com 40 px; menu ⋯ com 44 px por item.
- Barra inferior da equipe (todas as páginas) com ícones de linha.
- Erros que já existiam: "Envios e pendências" não aparece mais vazio no meio do painel; botão "✂ Enquadrar" da miniatura com 32 px de toque (tinha 27); selo "novos" legível (era laranja sobre laranja); 15 escapes Unicode de cinco dígitos trocados pelo caractere.
- Testes antigos atualizados para o cadastro atual (tamanho pela etiqueta, público "Homem"): `cadastro_plano_mestre`, `jornada_lojista`, `enquadrar_cadastro`, `admin_busca_status`.
- Mesmas funções, mesma ordem e mesmos textos; service worker renovado (tk-3.38.7).

## 7.16.0 — copiar de outra peça, ordem alfabética e filtros — 2026-10-26

- Cadastro, passo 3: botão "Copiar dados de outra peça" sempre à vista e as 3 parecidas com foto embaixo do nome. A tela cheia "Escolher peça para copiar" abre nos últimos cadastrados, com busca por nome ou código, filtros de situação, público e categoria (com contagem), ordem (mais recentes/A–Z) e fotos grandes. Tocar na peça copia todos os dados dela, com Desfazer; ✎ abre a peça para editar.
- Cores e categorias em ordem alfabética no cadastro (também depois de criar uma opção nova; "Consulte…" por último) e gravadas assim na peça.
- Loja: Tamanho e Cor já abrem expandidos nos filtros; filtros em ordem A→Z de verdade; Blusa/Conjunto/Short/Vestido não somem mais do menu.
- Loja: fechar a peça com o botão voltar não leva mais a lista ao topo; botões da barra de seleção com 44 px numa linha.

## 7.15.1 — "Editar peças" com "Consultar valor" — 2026-10-26

- A janela "Editar peças" recusava "Preço inválido" em peças "Consultar valor": reenviava o preço 0 sem a marca. Agora a peça segue como "Consultar valor" quando o preço não é alterado (também ao tocar em "Tentar de novo" nos envios que falharam).

## 7.15.0 — acabamento novo da vitrine (Opção A) — 2026-10-26

- Ícones de linha (`icones.js`) no lugar dos emojis no cabeçalho, busca, filtros, cards, peça, seleção, favoritos, barra inferior e rodapé.
- Nova camada `acabamento.css`: escala única de texto, cantos de 6–8 px, bordas finas, sem sombras, selos em preto.
- Preço em preto: "R$ x à vista" e "Normal R$ y", sem o riscado que parecia promoção em todas as peças.
- Card com "Consulte esta peça" como botão principal e "Selecionar" como ação secundária; estoque com ponto de cor e texto.
- Peça aberta: Favoritar, Compartilhar e Selecionar numa linha leve e "Consultar no WhatsApp" inteiro, sem caixa alta.
- Cabeçalho de 56 px com botões de 44 px; a busca fica encostada nele (sumiu a faixa vazia ao rolar).
- Filtros do desktop com campos inteiros (sem "Buscar por produ" e "Mín R" cortados).
- Mesmas funções, mesma ordem e mesmos textos de ação; service worker renovado (tk-3.38.5).

## 7.14.2 — IA insiste quando o Gemini está sobrecarregado — 2026-10-26

- "Gerar com IA" (foto): com o Gemini sobrecarregado (503, "high demand", demora), o painel tenta de novo sozinho, com espera crescente, até 12 vezes; mostra o andamento e tem botão Cancelar.
- Chave recusada ou cota de todos os modelos esgotada param na hora, com frase clara.
- Nada de JSON cru na tela. Funciona com o servidor 4.25; o 4.26 (Cofre) também troca de modelo, do mais barato ao mais caro, em cada tentativa.

## 7.14.1 — correção urgente do cadastro — 2026-10-26

- Cadastro, edição em lote, excluir, avisos e fila offline voltavam "WhatsApp ou senha incorretos" com a pessoa logada: a sessão nova (tk3) ia sem o WhatsApp do dono. O painel agora completa o WhatsApp a partir da própria sessão.
- O envio que termina em outra tela do app (nav.js) também manda o WhatsApp.

## 7.13.0 — editor gráfico de tutoriais — 2026-10-25

- Editar abre uma prévia em tela cheia com Anterior/Próxima, escolha visual do alvo e edição do texto flutuante na tela.
- Alterações são aplicadas à lista ao confirmar e descartadas ao cancelar; salvar/publicar continua explícito.
- Gestão das etapas responsiva com ações à esquerda e instruções multilinha.
- Protege etapas contra eventos antigos e remove cliques automáticos de recuperação.
- Valida digitação ao encerrar a edição e compara preços numéricos antes do ajuste do campo.


## 7.12.1 — marcador de tutorial reutilizável — 2026-10-25

- Remove a escolha de curso do tipo “Conteúdo dentro de um capítulo”.
- Permite reutilizar o mesmo código de atividade em qualquer manual e capítulo do Google Docs.
- Mantém a escolha de curso somente para a parte prática exibida ao final.

## 7.12.0 — atividades dentro dos capítulos — 2026-10-25

- Permite definir cada tutorial como curso independente, parte prática final ou conteúdo de um capítulo.
- Gera um marcador copiável `[[TUTORIAL:id]]` para inserir em qualquer ponto do Google Docs.
- Faz a conclusão do capítulo depender de todos os itens presentes: atividade interativa e checagens rápidas.
- Mantém tutoriais antigos vinculados ao manual como parte prática final.

## 7.11.1 — tutoriais dentro dos cursos do Docs — 2026-10-25

- Carrega os manuais autorizados antes de abrir o gravador, sem depender da ordem em que a tela de treinamentos terminou de iniciar.
- Exibe cada manual do Google Docs no campo “Onde aparece”, ordenado e sem duplicações.
- Mostra uma ação de nova tentativa quando a lista de cursos não puder ser carregada.

## 7.11.0 — cursos interativos e híbridos — 2026-10-25

- Substitui as páginas antigas de prática pelo gravador de atividades integrado aos cursos.
- Permite publicar uma atividade como curso interativo independente ou como parte prática de um manual do Google Docs.
- Registra conclusão, versão, acertos, correções, duração e data no servidor, com cópia local para resistir a falhas momentâneas de conexão.
- Mostra relatório de conclusão à gestão e confirmação ao aluno no próprio curso.
- Guarda o arquivo escolhido durante a gravação e oferece o mesmo arquivo para download durante a atividade.
- Compacta cartões e espaçamentos da tela de treinamentos para reduzir rolagem no celular.
- Adiciona a opção desmarcada “Arquivar após cadastrar” para peças criadas apenas em testes.


## 7.3.6 — gravador móvel compacto — 2026-10-24

- Substitui o cabeçalho alto por uma barra compacta de estado e quatro controles, reduzida ainda mais depois que a gravação começa.
- Divide a criação de texto em edição e posicionamento: a formatação fica recolhida e, ao posicionar, o painel vira uma faixa pequena para liberar a tela.
- Mantém comandos rápidos para editar, salvar ou cancelar enquanto a caixa é arrastada sobre a aplicação.

## 7.3.5 — menu inferior visível no tutorial — 2026-10-24

- Preserva o posicionamento `fixed` e `sticky` do elemento destacado, incluindo a navegação inferior do celular.
- Usa a altura visual dinâmica do navegador para gravação e teste em tela cheia, acompanhando abertura e fechamento das barras móveis.
- Mantém a placa de orientação dentro da área visível e fora do botão solicitado.

## 7.3.4 — etapas humanas, gravação e teste em tela cheia — 2026-10-24

- Impede que cliques automáticos usados para recompor menus sejam aceitos como ação do funcionário e pulem etapas do tutorial.
- Permite inserir, formatar e posicionar textos flutuantes sem encerrar a gravação rápida.
- Gravação e teste ocupam a tela inteira, com barra de controle compacta e a aplicação usando todo o espaço restante.
- Adiciona regressão específica para garantir que a etapa 3 só avance depois do toque real.

## 7.3.3 — seletor de foto e textos arrastáveis — 2026-10-24

- O toque no quadro visível de foto/arquivo passa pelo bloqueio do tutorial e abre câmera ou galeria; a validação continua ocorrendo somente depois da escolha real do arquivo.
- Etapas de arquivo aparecem como `Escolher foto/arquivo`, em vez de `Preencher`.
- Caixas de instrução aceitam posição por arraste no editor, guardam coordenadas, aparecem sobre a tela demonstrada e também podem ser movidas durante o tutorial.

## 7.3.2 — identidade correta dos controles do tutorial — 2026-10-24

- O jogador confirma que o elemento encontrado pelo seletor ainda corresponde ao nome do controle gravado, impedindo que uma posição antiga destaque outro botão ou uma caixa de dicas.
- Quando a estrutura da tela mudou, o controle correto é procurado pelo nome acessível; números dinâmicos entre parênteses não invalidam a correspondência.
- A etapa só aceita a ação no controle identificado corretamente e deixa de avançar por colisões de seletores antigos.

## 7.3.1 — jogador de tutorial estável — 2026-10-24

- A indicação passa a acompanhar o elemento no documento e não fica mais presa ao topo da tela quando o alvo sai da área visível.
- Rolagens suaves concorrentes são interrompidas; o jogador relocaliza, centraliza e aguarda o alvo estabilizar antes de liberar a etapa.
- Elementos recriados dinamicamente por formulários, modais e abas são resolvidos novamente pelo seletor da etapa.

## 7.3.0 — auditoria filtrável e recuperação geral do tutorial — 2026-10-24

- A auditoria usa a sessão atual completa, eliminando o falso erro de PIN para contas autenticadas.
- O histórico pode ser filtrado por data inicial, data final e vários usuários ao mesmo tempo, além da pesquisa por produto, código ou ação.
- O jogador de tutoriais recupera sequências de menus, modais e painéis em qualquer setor ao procurar ações anteriores visíveis até reencontrar o alvo.

## 7.2.6 — alvo visível e tela correta no tutorial — 2026-10-24

- O tutorial só posiciona o destaque quando o controle está realmente visível; campos escondidos deixam de enviar a seta para o cabeçalho.
- Se a tela necessária não terminou de abrir, a última ação de abertura é restaurada e o alvo é centralizado antes de mostrar a orientação.
- A placa “TOQUE AQUI” fica ao lado do controle, escolhendo automaticamente espaço acima ou abaixo sem sair da tela.

## 7.2.5 — indicação visual inequívoca — 2026-10-24

- A etapa destaca o cartão inteiro com contorno azul e branco pulsante, escurece o restante da tela e mostra a placa “👉 TOQUE AQUI”.
- Tutoriais antigos que apontam para um texto interno passam a destacar automaticamente o botão ou cartão clicável que contém esse texto.

## 7.2.4 — fotos e cartões no gravador — 2026-10-24

- Escolher uma foto vira uma única etapa e é validado pela presença real do arquivo, inclusive nos tutoriais gravados antes desta correção.
- Cartões de menu, como Cadastrar e Cadastrar nova peça, são capturados como controles completos e recebem uma borda de foco mais forte durante o teste.

## 7.2.3 — tutorial bloqueia toque fora da etapa — 2026-10-24

- Durante o teste, somente o controle destacado da etapa atual responde; tocar em outro botão não navega nem executa a ação.
- Quando a próxima tela ainda está abrindo, o tutorial bloqueia a interface e procura novamente o alvo automaticamente.

## 7.2.2 — sessão compartilhada em todos os módulos — 2026-10-24

- Postagens, Foto IA, Instagram, fotos de clientes, telemetria e upload R2 passam a aceitar a sessão compartilhada `tk3` já emitida pelo login atual.
- A prévia do gravador de tutoriais mantém o administrador autenticado ao abrir Postagens, sem pedir um segundo login.

## 7.2.1 — escolher início e visão do tutorial — 2026-10-24

- O editor abre em modo de preparação e só cria etapas depois de “Começar a gravação daqui”; a preparação é repetida silenciosamente para o aluno.
- A prévia permite escolher a visão de Cliente, Aluno, Novato, Estagiário, Funcionário, Equipe do site, Equipe catálogo, Encarregado, Admin, Admin total ou Responsável RH.


## 7.2.0 — gravação rápida de tutoriais — 2026-10-24

- Cliques gravados passam a executar normalmente, permitindo abrir menus e continuar gravando dentro deles.
- O modo rápido registra cliques, seleções e textos digitados sem abrir o formulário a cada ação; campos recebem validação exata automaticamente.
- Ao encerrar, todas as etapas aparecem numa planilha editável. Textos flutuantes aceitam tamanho, cores, borda, posição, negrito, itálico e sublinhado.


## 7.1.4 — atualização garantida do editor — 2026-10-24

- Os arquivos do editor recebem versão na URL para o celular descartar a cópia antiga imediatamente.

## 7.1.3 — editor de tutoriais sempre visível — 2026-10-24

- O editor deixa de depender da existência de um manual com capítulo de prática e passa a aparecer sempre para quem pode gerir manuais.

## 7.1.2 — sessão preservada entre áreas — 2026-10-24

- Uma rejeição de sessão pelo RH não apaga mais o login válido do Catálogo e da Gestão.
- Quando uma sessão antiga precisa ser convertida, o portal explica que basta entrar uma vez e mantém as opções da barra inferior.

## 7.1.1 — gravador de tutoriais — 2026-10-24

- O RH pode gravar um tutorial escolhendo controles diretamente numa prévia da tela real, escrever orientação e observação, ordenar etapas e definir a regra de acerto.
- O modo de teste destaca a etapa, bloqueia a ação verdadeira e informa o erro imediatamente. Tutoriais publicados aparecem para a equipe e registram acertos, erros e duração.
- Novo backend RH 3.21 guarda tutoriais, versões e resultados com a mesma permissão usada para gerir manuais.

## Pacote 1 — menu, pesquisa e filtros — 2026-10-23

- **Menos coisa antes do primeiro produto.** Gênero e categorias passam a viver num único bloco recolhido no celular (aberto no desktop) e a faixa de vantagens nasce fechada no celular. A vitrine aparece antes, sem 22 controles no caminho.
- **A grade não pula mais ao carregar.** A caixa da foto reserva a altura antes de a imagem chegar (aspect-ratio) e as faixas de pílulas têm altura mínima — o CLS cai de 0,18 para menos de 0,10.
- **Cartão mais limpo e mais baixo.** As duas ações ficam lado a lado em qualquer tela e a categoria saiu do cartão (ela já aparece na pílula selecionada e na janela da peça).
- **Barra inferior só no celular.** No desktop (a partir de 900px) a barra de compra sai de cena e o espaço que ela ocupava volta para a página. No celular ela continua com Início · Buscar · Seleção · Atendente.
- **Nada de letra miúda.** Código do produto, categoria e rótulo da barra inferior têm piso de 12px.
- **"Limpar filtros" sempre à vista** quando há filtro ativo — antes, no celular, ele ficava escondido dentro da gaveta fechada.
- **Categorias repetidas juntadas.** "Blusa" e "Blusas", "Vestido" e "Vestidos", "Conjunto" e "Conjuntos", "Short" e "Shorts" passam a aparecer uma vez só, na forma com mais peças (mapa de sinônimos aplicado na leitura, sem mexer na planilha).
- **Cache-busting** `?v=` em catalogo.js, vitrine.js e vitrine.css, para o navegador não servir a versão antiga.

## Enquadramento por gestos — 2026-10-22

- A foto abre maior e os ajustes ficam recolhidos. Arrastar, pinçar e girar continuam disponíveis; desfazer e aplicar a todas ficam à vista.


## Treinamento protegido — 2026-10-22

- Manuais passam a vir somente da sessão autorizada; conteúdo embutido e cache legado removidos. Configuração de provas usa POST protegido quando o RH anuncia suporte.


## Fotos com IA — 2026-10-21

- Planejar até 20 looks, dividir em grupos de até dois ou três respeitando quatro referências, trocar peças por arrasto/teclado e retomar somente o restante após falha parcial.

- Cada resultado guarda as peças e preços à vista usados no pedido; legenda e link da seleção podem ser copiados numa seção recolhível.

## Capa de vídeo — 2026-10-21

- No cadastro, reproduzir o vídeo e escolher um quadro como nova foto de capa, preservando fotos e vídeo até salvar.


## Em revisão — cadastro (2026-10-21)

- Duplicação mantém nome e atributos, sem mídia; padrões se aplicam somente a cadastros novos.
- A primeira escolha de outro gênero substitui o padrão automático; escolhas seguintes permitem múltiplos gêneros.
- Pendências de envio permanecem acessíveis e o retorno ao menu aguarda confirmação de sucesso.


## [Não publicado] - 2026-10-18 (v4.27)

### Adicionado
- **Seleção com validade**: a seleção de peças expira em 2 h sem uso (3 h se o cliente toca em "segura minha seleção"); ao tentar sair aparece a placa "Libera a seleção / Segura, volto já já / Continuar vendo a loja" (vale também para link `?sel=`).
- **Busca com sugestões**: enquanto digita, mostra peças e categorias que têm resultado; se não existe igual, mostra "Não achei igual" e sinônimos (camisa/camiseta/blusa…).
- **Painel**: ação pendente de conexão vira um chip flutuante (sem `alert`); "O que postar" aceita fotos e vídeos avulsos do aparelho com a ordem escolhida; com "Fazer em todos" desligado, editar o texto vale só para a foto selecionada.
- **🎨 Fotos com IA** (gestor e equipe do site): o Gemini gera uma capa de campanha a partir de 1–4 fotos reais da peça, com instrução editável pelo gestor; sem cota o pedido espera na fila e roda quando a cota volta. **Ainda não foi provado contra o Google real** (modelos de imagem costumam não ter plano gratuito).

### Corrigido
- **Publicação dos Workers pelo deploy** (PR #34): com `skip_ci` os jobs `Publicar …` ficavam *skipped* e nenhum Worker era publicado desde 16/10/2026.

### Alterado
- Workflows fixados em `ubuntu-24.04` (o GitHub migra `ubuntu-latest` para o Ubuntu 26 em 19/10/2026).
- Documentação revisada: versões dos backends (catálogo 4.21, RH 3.16), fim das instruções de colar versões antigas, pendências reunidas em `okou.md`; pacotes de patch já aplicados (`patches/tenkitermodas-v3.11`, `v4.10`) removidos.

## [Não publicado] - 2026-10-18

### Adicionado
- **Treinamento "verificado" (módulo 0, só administrador)**: checagem rápida dentro da lição (sem nota; só libera
  "Confirmo que li" depois de acertar), perguntas da *regra de ouro* na prova (`[CRÍTICA]`: errou uma, não passa),
  aba **Prática & Certificados** para a gestão validar a prática (fica registrado quem e quando), certificado com
  código e QR (sem nota, sem CPF) e página pública `verificar.html`. Novos arquivos: `tm-verificado.js`,
  `verificar.html`, `vendor-qrcode.js` (qrcode-generator 1.4.4, MIT).
  **Só liga quando o backend RH 3.16 anuncia `certificados` em `?action=versao`**; manuais 1 a 3 não mudam.

## [Não publicado] - 2026-10-16

### Adicionado
- **Postagem multicanal (Instagram · WhatsApp · Ambos)**: seletor de canal na tela de postagem do
  painel. O contrato do canal passa a viver em `common.js` e o `POST /post` envia
  `canal=instagram|whatsapp|ambos`. Com `instagram` (padrão) o comportamento é idêntico ao de antes.
- **Integração Wafly (status do WhatsApp) no backend** (Apps Script 4.14 / 3.14, **fora do
  repositório**): envio server-side de texto e status com deduplicação, retry idempotente e validação
  de webhook. As credenciais `WAFLY_CLIENT_TOKEN`, `WAFLY_INSTANCE` e `WAFLY_TOKEN` ficam **apenas**
  nas Propriedades do Script — nunca no repositório, no frontend ou nos logs.

### Alterado
- **Cache do site**: `OneSignalSDKWorker.js` — `VERSAO` de `tk-3.11.0` para `tk-3.12.0`, para renovar o
  cache de `common.js` e `admin-postagens.js` em todos os aparelhos.

### Notas
- Histórico do passo a passo (Apps Script e as 3 propriedades da Wafly) em
  `patches/postagem-multicanal-wafly/como-aplicar.md`.

## [1.0.0] - 2026-10-15

### Adicionado
- **INFRA-01 — Pipeline de CI/CD**: GitHub Actions com scan de segredos, validação de sintaxe JS,
  checagem de estrutura HTML e a bateria de testes que já existia no repositório (`tests/`).
  Portão de qualidade obrigatório antes de qualquer deploy.
- **INFRA-02 — Deploy confiável**: deploy disparado pela API do Render dentro do CI, com
  acompanhamento até o status `live`, limpeza de cache no Cloudflare e verificação do commit
  publicado em `/version.json`. Substitui o fluxo manual (trigger + polling + curl na mão).
- **INFRA-08 — Versionamento**: `VERSION`, `CHANGELOG.md`, `version.json` publicado no ar e
  workflow de release que cria tag semver + GitHub Release.

### Notas
- Os backends `.gs` continuam fora do repositório (por segurança) e seguem com deploy manual
  no Apps Script — ver `docs/CI-CD.md`.

## 7.30.0 — APK de atendimento e preparação de push Android — 2026-10-26

- Adiciona app Android TENKiTER Mensagens (Kotlin, WebView, OneSignal nativo) com site separado no navegador, anexos, áudio autorizado e logout.
- Modo app abre diretamente a caixa de mensagens após login autorizado.
- Adiciona registro de aparelho, fila persistente de avisos individuais e configuração da App API Key em Conexões.
- Notificações reais dependem da configuração Firebase/FCM no OneSignal pelo proprietário. Homologação Android física pendente.
