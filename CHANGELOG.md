# Changelog

## 7.55.8 — vídeos, seleção imediata e solicitações de clientes

- Aba Vídeos separa upload/preparo do rascunho; Recuperar vídeos inclui o original completo e permite limpar a biblioteca sem apagar cópias em uso.
- Postar seleção agora mantém originais em sequência por confirmação, afasta a fila comum e protege envios incertos. Horário da seleção permanece disponível.
- Esteira edita a descrição geral do envio e arquiva/restaura fotos próprias com permissão específica.
- Mensageiro registra fotos pela ficha e pedidos com fotos, descrição, responsável, situação e observações internas; reaproveitamento na resposta prepara um rascunho.

## 7.54.5 — aparência aprovada na auditoria

- Aplica o comparativo aprovado: ferramentas mais legíveis, descrições de14px, alvos de toque de44px e atalho Ferramentas do gestor.
- Retira purge inaplicável ao domínio e desacopla a recuperação Android; mantém verificações obrigatórias e resume os componentes publicados.
- Preserva destinos, permissões, estoque opcional e comportamento das tarefas. Alteração somente no conteúdo remoto; sem novo código Android.

Todas as mudanças relevantes do site TENKiTER Modas.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento [SemVer](https://semver.org/lang/pt-BR/).

<!-- novas versões entram logo abaixo desta linha -->

## 7.78.11 — Configurações da Esteira com categorias em separado

- Funções, escala, regras e modelos abrem sem consultar o catálogo. A lista de categorias carrega em separado, com nova tentativa em caso de falha.
- O gestor pode salvar a reativação com as categorias indisponíveis. A categoria fixa cadastrada continua visível e só é enviada se houver edição nesse campo.

## 7.78.10 — Pedidos, catálogo sob demanda e listas da Esteira

- O editor de Pedidos abre com dados do pedido e do fornecedor. Detalhes do catálogo entram conforme chegam, sem remontar os campos.
- Preparação e Fotos vazias deixam de consultar a lista completa do catálogo. O navegador carrega os detalhes quando são necessários.
- Duas aberturas simultâneas de Hoje gravam as atribuições e o foco de forma transacional. Quando a lista muda durante o cálculo, o Worker relê e recalcula.


## 7.78.7 — Menu da Esteira enquanto a lista de Hoje carrega

- A Esteira confirma em paralelo o acesso ao menu. Depois da confirmação, as abas permitidas ficam disponíveis enquanto as listas de Hoje terminam de carregar.


## 7.78.5 — Caixa de fotos com paginação no servidor

- A Caixa abre com as primeiras 24 fotos e permite carregar as anteriores sem perder as fotos já selecionadas. O servidor mantém contagens por situação e o mesmo controle de acesso.
- A Caixa consulta somente a referência mais antiga de cada foto repetida, inclusive quando o envio original está em outra página.


## 7.78.4 — Navegação e Fotos na Esteira

- O login inicia a Esteira uma vez. A navegação mantém o foco e a revalidação retoma só a aba em uso.
- Fotos começa a carregar a Caixa sem esperar pela fila local. Respostas atrasadas de outro filtro ou outra sessão deixam de substituir a tela.
- O navegador registra marcos de abertura e retorno às abas, disponíveis para medir no Android.


## 7.78.3 — Primeira etapa de desempenho da Esteira

- Hoje busca apenas os dados de conferência e família dos produtos da lista e agrupa as leituras independentes.
- Preparação agrupa tarefas por produto. Caixa e outras rotas evitam ler configurações que não usam. Requisições simultâneas compartilham a inicialização do banco.
- As leituras principais da Esteira informam tempos por etapa ao navegador do site, com acesso confirmado.


## 7.78.1 — Story no Instagram: "Media ID is not available" e "resource does not exist" não derrubam mais a postagem

- Causa: às vezes o Instagram ainda está preparando a mídia quando o servidor consulta ou publica. As duas mensagens eram tratadas como mídia inválida: a postagem gastava tentativa, recriava o container e esperava 5 min (o Story atrasava; ex.: Story de 19:20 ainda na fila às 20:00).
- Agora são tratadas como "preparando": volta em 1 min com o mesmo container, sem pausar o Instagram inteiro, e refaz o container na 3ª e na 5ª tentativa. Só vira erro depois de 6 tentativas.

## 7.77.1 — Mensageiro mostra a foto do story/post que o cliente compartilha no Instagram

- Antes: quando o cliente compartilhava um story ou post, a conversa mostrava só "Compartilhamento" (a imagem era descartada).
- Agora a imagem é copiada para o nosso armazenamento e aparece na conversa. Se o link não for uma imagem, continua só o aviso, sem gravar página como foto e sem ficar tentando de novo.
- Só vale para mensagens novas: as já recebidas não trazem mais o endereço da imagem.

## 7.77.0 — perfil "tudo menos Admin": Esteira, Mensageiro, Fotos com IA e Postador funcionam juntos

- Painel simplificado (perfil Equipe catálogo 1): continua escondendo pedidos, números, preços e configurações, mas agora mostra as ferramentas que a pessoa recebeu — Mensagens, Fotos com IA e Esteira. Antes escondia Fotos com IA mesmo com a permissão.
- Novo atalho "Esteira" em Ferramentas (quem tem o acesso Esteira ou é Admin total).
- Teste do servidor com o perfil completo sem Admin: Esteira, Postador, Fotos com IA e Mensageiro abrem; funil, métricas, exportar e configurações do Mensageiro continuam fechados.

## 7.76.2 — Esteira e demais acessos do RH funcionam mesmo com o Apps Script do catálogo desatualizado

- Causa: o servidor lia as permissões no Apps Script do catálogo publicado (4.29), que não conhece os Acessos configuráveis; por isso "Esteira", Postador, Fotos com IA e Mensageiro marcados no RH não chegavam e a Esteira respondia "Seu acesso não permite entrar".
- Agora, se o catálogo não devolver Acessos configuráveis, a sessão e a equipe da Esteira são conferidas no RH (fonte oficial). Se o RH falhar, nada muda. Quando o catálogo 4.30 for publicado, deixa de ser necessário.
- Teste do servidor cobre catálogo antigo sem/ com RH.

## 7.76.1 — Esteira: lista "Usadas" (e qualquer lista com mais de 100 fotos) volta a abrir

- A lista de fotos recebidas dava erro no servidor quando tinha 100 ou mais fotos diferentes (ex.: "Usadas · 121"), porque a consulta de fotos repetidas passava de 100 parâmetros, o limite do banco. Agora a consulta é feita em blocos.


## 7.76.0 — Esteira: quem tem o acesso "Esteira" entra

- Pessoa com o acesso "Esteira" em RH > Acessos recebia "Seu acesso não permite entrar na Esteira" quando a lista de equipe vinda do RH não a trazia (conta antiga, ajuste individual…). Agora o servidor trata quem tem o acesso como membro da equipe (confere e rodízio), como a própria tela da Esteira já diz. Sem o acesso continua barrado.


## 7.75.0 — Mensagens: aviso de acesso falso corrigido e recusa diz qual permissão falta

- App (atalho/notificação): quem tem acesso às Mensagens e não é Admin recebia "Sua conta não tem acesso ao módulo Mensagens" por engano, porque o app decidia antes de o servidor responder os direitos. Agora espera a resposta.
- Quando o servidor recusa uma ação de Mensagens, o aviso diz qual permissão falta (ex.: "Falta a permissão \"Responder e encerrar atendimentos\" (Acessos → Ferramentas de Mensagens)") e a ferramenta vem no campo `ferramenta`.


## 7.74.0 — Instagram: janela real de resposta e Acompanhar funcionando

- Instagram: o aviso "mais de 24 h" saiu. A regra real é 24 h padrão e até 7 dias com a etiqueta de atendente humano (o Worker já a usava); o aviso só aparece além dos 7 dias e o botão Enviar nunca é travado.
- Agendar e Acompanhar no Instagram só recusam horários depois dos 7 dias (antes: 24 h, por isso o Acompanhar quase não armava). Lembrete e agendadas saem com a etiqueta quando o prazo de 24 h passou; recusas da Meta viram erro claro em português e o Acompanhar não encerra por engano.
- Envio direto pela API da Meta (sem Zernio) também repete com a etiqueta.


## 7.73.0 — encerrar cliente fecha todos os canais; pontuação pela média dos canais

- Mensageiro: encerrar uma conversa (pela seleção, pelo menu da conversa, em lote ou automaticamente por falta de resposta no Acompanhar) encerra todos os canais abertos do mesmo cliente, na mesma operação. A pergunta "Incluir os outros canais deste cliente?" saiu; o aviso diz quais canais também serão encerrados.
- O Worker garante a regra (transação D1, idempotente, sem apagar dados) e reabrir continua individual.
- Ficha do cliente: uma venda encerrada em vários canais conta como uma compra só.
- Pontuação (Hist.): cliente com vários canais conta uma vez, pela média dos canais. Histórico antigo não é reescrito; o cálculo agrupa por rodada de encerramento. Regras e exemplos em docs/ia/mensageiro-pontuacao.md.

## 7.72.0 — painel abre mais leve no celular

- A lista de produtos do painel (e a vitrine) reconhece o tecido de cada produto por um índice lembrado, em vez de refazer a normalização de todos os apelidos para cada produto. No teste, desenhar 700 produtos caiu de ~57 ms para menos de 1 ms (mesmos resultados). No celular emulado esse trabalho ocupava ~1,4 s do processador logo ao abrir o painel, atrasando também o Mensageiro.

## 7.71.0 — Mensageiro: mensagem nova aparece sem esperar a lista

- Quando chega uma mensagem do cliente (ou ao voltar para a tela), ela aparece na conversa aberta na hora; a lista de conversas atualiza ao lado, sem segurar a mensagem (antes a conversa esperava a lista inteira recarregar).

## 7.70.0 — Mensageiro: fila de envio

- Dá para escrever e enviar outras mensagens enquanto uma ainda está saindo, na mesma conversa e em outras. Cada uma aparece na hora na conversa com ⏳ e vira ✓ quando o servidor confirma.
- Na mesma conversa a ordem é sempre a que você escreveu; conversas diferentes saem ao mesmo tempo.
- Se uma mensagem falha, as seguintes DA MESMA conversa esperam ("Aguardando a anterior") e as outras conversas seguem. "Tentar de novo" reenvia com a mesma chave (não duplica); "Descartar" libera as seguintes.
- O texto fica guardado no aparelho antes de sair e volta ao recarregar a página. Mensagem guardada há mais de 30 minutos não sai sozinha: pede para você conferir. Foto, vídeo e áudio entram na mesma ordem, mas ficam só na memória.

## 7.69.0 — Mensageiro mais rápido: abre na hora e conversa sem espera

- A lista de conversas, a conversa aberta e a troca de aba aparecem do que está guardado no aparelho (por conta, sem senhas, links ou fotos) enquanto a rede confirma em segundo plano; o campo de resposta não trava e o que você digitou não some quando a atualização chega.
- A lista não espera mais o resumo para carregar; ao encostar o dedo (ou parar o mouse) numa conversa, a leitura dela já começa.
- Servidor: resumo, lista e conversa fazem as consultas independentes ao mesmo tempo (antes em fila). Nenhum dado é migrado ou apagado.

## 7.67.0 — excluir solicitação de cliente, com permissão

- Mensageiro → Solicitações de clientes ganha "Excluir solicitação": confirmação nativa dizendo a consequência e aviso "Solicitação excluída · Desfazer". A solicitação some de todas as listas e filtros; fotos, conversa e registros continuam guardados (exclusão lógica, com quem excluiu e quando).
- Nova permissão "Excluir solicitações de clientes": por padrão só o Admin total; ele libera outras pessoas em Acessos → Ferramentas de Mensagens. O servidor recusa quem não tem a permissão, mesmo por chamada direta. Funciona para sessões já abertas.
- D1: duas colunas novas e opcionais (`excluida_em`, `excluida_por`) criadas de forma aditiva; nada é apagado.

## 7.66.0 — dívida de padrões: laranja, z-index e avisos (sem mudança visual)

- Laranja solto: 8 usos do laranja da marca em avisos, Minha conta, convite do app e telas de gestão passam a `var(--laranja, #E67E22)` (mesmo valor, com fallback); o check reconhece o fallback do próprio token como correto.
- z-index: nenhum valor mudou; os 24 casos sem degrau equivalente estão listados em `docs/ia/padroes-site.md` (seção 1.1) para decisão do dono.
- Currículo: o limite de escolhas usa o aviso padrão em vez de `alert()`.
- Baseline de `check_padroes.py`: 351 para 232 ocorrências (laranja-solto 321 para 203; alert 5 para 4).

## 7.65.0 — textos com concordância certa e acabamento visual

- Textos de interface após a troca de "peça" por "produto": "Produtos mais vistos", "os próximos produtos colocados em preparação", "o próximo produto", "produtos parados", "vendidos separadamente", "os marcados", "arquivados" e afins, com o gênero certo.
- Textos já gravados continuam reconhecidos: a dica da composição de Fotos IA vale para "peças" e "produtos vendidos separadamente"; o Histórico trata "Editou a peça" e "Editou o produto" como a mesma ação genérica. Nada foi apagado nem migrado.
- Mensagens no computador: as abas do painel estreito não partem mais a palavra ("Solicitações", "Em atendimento"); alvo de 44 px mantido.
- Currículos e "Minha conta": as abas voltam a dividir a linha (Entrar / Criar conta deixou de ficar com 75 px).
- Foco por teclado: anel laranja escuro (#D35400, contraste de 4,2:1 sobre branco; antes 2,9:1) em um único token, `--tk-foco-cor`.
- Lista da Gestão: caixa de seleção com borda branca, anel e sombra escuros; vazia e marcada ficam inequívocas sobre foto clara ou escura (alvo de 44 px igual).

## 7.64.0 — solicitações de clientes com fotos à vista e registro em segundo plano

- Solicitações de clientes mostra até três miniaturas (4:5) lado a lado em cada pedido; o toque amplia e permite passar por todas as fotos, anexar à resposta e voltar à lista.
- Registrar pedido ou fotos de cliente guarda tudo no aparelho e libera a conversa: o envio segue em segundo plano com um indicador flutuante (enviando, concluído ou precisa de atenção) e um painel para acompanhar, minimizar e tentar de novo.
- Reenvio seguro: o pedido e cada foto usam sempre os mesmos identificadores; fotos já confirmadas não sobem de novo e, se a página fechar, os envios guardados retomam ao reabrir o Mensageiro na mesma conta. Nenhuma mensagem é enviada ao cliente.

## [7.63.0] - 2026-11-08

Pagamento de dívida de padrão (catraca de `check_padroes.py`: 387 para 351 ocorrências), uma regra por commit, sem mudar `common.js`.

- `common.js?v=` igual em todas as páginas (7.59.0): só o parâmetro dos HTML mudou (index, esteira, fotos-ia, admin, treinamentos, currículos).
- 404, manual (redirecionamento), treino de cadastro (simulação) e fotos-ia passam a carregar `janelas.css`, `a11y.js` e `tk-padrao.css`. Na simulação a Escolha de categoria mantém os 52 px de antes e o "Preciso de uma ajudinha" ganhou área de toque de 44 px.
- Postagens: o fechar da Colagem e do menu "Adicionar à arte" usa `tk-fechar` (✕ 44 por 44 contornado; a Colagem deixou de ter o texto "✕ Fechar").
- Erro de envio ao Cloudinary e diagnóstico do Zernio sem "HTTP" na tela (o código aparece como "código 404").
- Treinamentos e Instagram (Descartar com Desfazer) usam `TKAviso` no lugar de aviso próprio; o teste local do push usa `SITE_URL`.
- `z-index` 20, 80 e 100 viraram `var(--z-sticky|menu|folha, N)` com o mesmo número (ordem das camadas igual, conferida por estilo calculado nas páginas tocadas).

## 7.62.2 — janelas sempre cabem na tela e arquivos novos chegam certos

- `janelas.css` e `a11y.js` agora têm `?v=` novo em todas as páginas (a correção das abas foi publicada sem trocar o número e o celular podia montar HTML novo com CSS velho).
- Folhas e janelas nunca passam da largura da tela (`max-width:100%`, blocos podem encolher, títulos e parágrafos longos quebram; selos e botões não mudam de tamanho).
- Novo check de CI `check_versao_assets.py`: CSS/JS alterado exige `?v=` novo nas páginas.
- Contagens dos chips de Público (Feminino/Infantil/Masculino) voltam a aparecer na vitrine.


## [7.62.0] - 2026-11-08

- Postagens: "Usar os N produtos juntos" não tem mais teto de 8. O botão fica habilitado com qualquer quantidade e a seleção inteira vai para a postagem, cada foto com os dados do seu produto (antes a oitava cortava os demais em silêncio).
- Prévias em grupos de dez, com "Anteriores / Próximas" e contagem ("1–10 de 100 fotos"): só esse grupo de canvases fica em memória no celular e o cache de imagens é limitado a 20.
- Story com mais de 60 mídias avisa antes de subir arquivos (a fila aceita 60 postagens por envio) e mantém a seleção para enviar em etapas.
- Substitui o PR #385 (parte de Postagens); a parte de registros de clientes/solicitações do #385 não entra nesta versão.

## [7.61.1] - 2026-11-08

- Corrige as faixas de abas (Postagens, Avisos e outras): na 7.61.0 cada aba ficou com a largura da tela inteira e só a primeira aparecia (sumiram Fila, Postar à mão, Já postadas…). A regra única das abas agora fixa a largura pelo texto. Teste novo `tests/abas_visiveis.py` (falha no código anterior).

## [7.61.0] - 2026-11-08

- Padrão de aparência único: novo `tk-padrao.css` (carrega por último em todas as páginas) concentra cores da marca, alvo de toque de 44 px, botão por papel (principal, secundário, perigoso, texto), campo (44 px, fonte 16, raio 8), chip, foco laranja de 3 px, foto 4:5 e selos. Os acabamentos deixam de repetir os tokens.
- Nenhum controle abaixo de 44 px nas telas medidas (vitrine, Gestão, Cadastro, Postagens, Instagram, Métricas, Push, Conexões, Tecidos, Famílias, Fotos IA, Esteira, RH, Verificar): botões dos cartões, chips, abas, tamanhos da vitrine, caixa de seleção da lista, remover foto do Cadastro.
- Cadastro da peça no padrão Opção A: laranja do token, campos de 44 px com raio 8, botão principal sem sombra e com texto escuro; chips e botões no mesmo formato do resto.
- Ações principais com um só raio e altura mínima de 48 px; ações perigosas (Descartar, Desconectar, Excluir) viram secundárias em vermelho; contraste do botão de Verificar corrigido.
- Foco visível único (laranja, 3 px) também em Treinamentos, Currículos e Verificar; tons de laranja e marrom soltos trocados pelos tokens.
- Chips marcados passam a expor `aria-pressed` (a11y.js) em Lista, Push, Métricas, Cadastro e filtros da vitrine; lupa em todas as caixas de busca.
- Foto de produto 4:5 também na vitrine (cartão e galeria) e no Instagram; selos de foto e de estado com um estilo e uma posição.
- Vitrine reserva a altura da grade e o deslocamento de layout em rede lenta cai de 0,155 para 0,025 no celular. Teste `tests/padrao_aparencia_ui.py` trava as regras.

## [7.60.0] - 2026-11-08

- Avisos que não travam a tela: novo `avisos.js` (região única empilhada, sucesso some em 6 s, erro fica até fechar, "Desfazer" quando reversível). Substitui os `alert()` de sucesso/informação da Gestão, Instagram, Conexões, Mensageiro, Postagens, Avisos e Pedir fotos; o aviso não cobre mais a faixa de juntar/separar.
- Confirmações: "toque de novo" da Esteira e das Famílias viram `confirm()` com a consequência; exclusões dizem "Não dá para desfazer"; nova senha em campo de senha numa janela (Treinamentos).
- Arquivar/reativar produto: botão travado, aviso de sucesso com Desfazer e motivo do erro. Treinamentos: aviso anunciado por leitor de tela e foto de perfil só aparece após o servidor confirmar.
- Vocabulário único: produto, seleção, Gestão, Pedir fotos, Público, Tentar de novo, "…", MB, você; plurais corretos. Telas vazias dizem o que fazer.
- Testes `padrao_vocabulario.py` e `avisos_padrao.py`.

## [7.59.0] - 2026-11-08

- Fotos leves: cada foto nova ganha, no momento do envio, cópias de 480 px e 240 px (feitas no aparelho, guardadas ao lado da original no Worker de mídia, contadas no limite de armazenamento). A vitrine, a lista do painel, as bolinhas de fotos e a seleção pedem a cópia (`?w=480`/`?w=240`); sem cópia, o Worker devolve a original. Vitrine em 390 px: de ~9,5 MB para ~0,5 MB de foto ao abrir (medido com fotos de 1080 px e serviços simulados).
- Fotos antigas: workflow manual `Cópias reduzidas das fotos antigas` (`scripts/fotos/gerar_minis.py`) gera as cópias em lotes, sem apagar nada e sem segredo novo (identidade OIDC do GitHub).
- Painel: a lista de produtos e as fotos só são montadas depois do login (antes: ~30 mil nós e ~2,4 MB de fotos atrás da janela de entrada). Lista grande aparece em duas etapas (80 primeiros cartões na hora).
- `common.js` (`fotoMini`) entra no APK: Android 2.4.23 (versionCode 30), sem mudança de comportamento do aplicativo. Todas as páginas passam a carregar `common.js?v=` igual à versão do site.

## [7.58.0] - 2026-11-07

- Regras iguais em todas as telas: a equipe só escolhe categoria já cadastrada (também na barra de seleção da Gestão); só o Admin total cria nome novo, e a trava agora vale no código, não só na aparência.
- Postagens, pedir fotos e foto do cliente ganham chave de operação: tocar de novo depois de um "sem confirmação" não duplica; a tela manda conferir a Fila.
- Preço: o filtro da vitrine compara o preço à vista (o mesmo do cartão) e o rótulo diz isso; o Google recebe o preço de tabela, igual ao compartilhamento da peça.
- Erros sempre em português (foto do cliente, famílias, treinamentos, currículo, Esteira, editor de visual): nunca JSON nem código HTTP. Telefone, contagem de fotos e data/hora de Fortaleza passam por funções únicas (padrao-dados.js).
- Disponibilidade mostra "R$ 89,90"; Gestão em "Mais recentes" sobe peça com foto nova; "Enviar para modelo IA" segue a mesma permissão do cartão; links compartilháveis usam o endereço oficial; desconto à vista lido de uma só constante.

## 7.57.0 — janelas e navegação com uma só gramática

- Toda janela do site fecha igual: botão ✕ de 44 px contornado no canto superior direito (`janelas.css`, classe `tk-fechar`), inclusive Minha conta, Seleção, Rastreio, Compartilhar, menu lateral e Filtros.
- Voltar do Android, Esc, foco inicial/devolvido e Tab preso valem também para a foto ampliada de Mensagens, foto de perfil, certificado, "Zerar dados" e tutorial de Treinamentos, "Escolher capa do vídeo" (agora fecha ao tocar fora), folhas da Esteira e painel de Filtros. O Esc dos Filtros só age quando eles são a janela do topo.
- Disponibilidade e as folhas de edição da Esteira perguntam antes de descartar o que foi alterado (toque fora, Esc, ✕ e Voltar).
- Aba/segmento ativo único (preto, `aria-selected`) em Avisos, Instagram, Postagens, Mensagens, Gestão do atendimento, Esteira, Fotos com IA, Treinamentos, Currículos e Minha conta. Fim do laranja que nunca valia.
- Altura das folhas em `dvh` (com reserva em `vh`) no painel, no detalhe do produto e na janela de avisos; fundo da página travado de um jeito só (`tk-travado`).
- Escala de camadas nomeada (`--z-*`) no lugar dos números soltos.
- Esteira ganha "‹ Gestão" para voltar; "Ir para o conteúdo" e foco laranja de 3 px em todas as páginas.


## [7.56.4] - 2026-11-08

- Mensagens: o envio deixa de demorar vários segundos. Cada mensagem fazia até 3 conferências seguidas de sessão no Google (2 a 3,5 s cada); agora faz no máximo 1, e as ações de rotina do atendimento (enviar, marcar como lida, encerrar, assumir, notas, ficha, agendar) aproveitam o cache de 2 minutos da leitura das conversas. Configurações e acessos continuam conferindo a sessão na hora.
- O nome do atendente e a assinatura saem de uma consulta só ao banco (antes até 6) e em paralelo; o "responsável" da conversa é gravado em segundo plano, sem a pessoa esperar.

## [7.56.3] - 2026-11-07

- Prova do manual: o estagiário (e qualquer pessoa) sempre consegue finalizar. Pergunta impossível de responder (sem alternativas) deixa de travar o botão Corrigir; se algo falhar na correção, o botão é liberado com explicação.
- Nota da avaliação fica guardada no aparelho até o servidor confirmar. Se o servidor recusar ou a internet cair, a tela diz o motivo em português (sessão, permissão, limite, conexão) e oferece "Enviar de novo"; ao entrar de novo, notas pendentes são reenviadas sozinhas (o servidor ignora repetição).

## [7.56.2] - 2026-11-07

- Pedido do cliente deixa de esperar indefinidamente: confirmações têm prazo e podem continuar com a mesma solicitação e as mesmas fotos.
- Rascunho e anexos pendentes ficam neste aparelho, separados por conta, para retomar após fechar ou recarregar; conclusão exige confirmação do servidor.
- Solicitações permite acrescentar fotos ao pedido já registrado, sem refazer texto/ficha; a mesma imagem não cria cópias no pedido, inclusive em tentativas concorrentes.
- Mostra a quantidade de fotos anexadas, prévias e andamento por arquivo. Nenhuma ação envia mensagem automaticamente.


## [7.56.1] - 2026-11-07

- Conclui a biblioteca de vídeos, recuperação por conta e seleção imediata de mídias do PR383, preservando as proteções de pausa, limite e recibos da7.56.0.
- Seleção imediata impedida por erro, falta de conexão ou limite deixa a fila comum seguir, sem liberar a próxima mídia selecionada nem repetir a que falhou.
- Corrige a atualização da fila e das fotos que reconstruía a aba Vídeos, removendo o seletor de arquivos durante o uso. Mantém o alvo de48px e os rascunhos.
- Integra solicitações de clientes com fotos privadas e resposta como rascunho, sem envio automático. Arquivo de fotos próprias permanece sujeito à permissão explícita do RH.


## [7.56.0] - 2026-11-06

- Postagens à prova de falhas bobas: uma falha nunca trava a fila dos outros. Série com parte em erro ou descartada fica “parada” com aviso e não segura o canal; no “Instagram + WhatsApp”, WhatsApp confirmado conta como parte enviada e o Story que faltou vira “Instagram não saiu — Repostar só o Story”. Vigia: nenhuma série segura o mesmo canal por mais de 20 min.
- Limite ou bloqueio do Instagram (“too many actions”, “action is blocked”, rate limit, códigos 4/9/17/32/368/613/80000–80014, subcódigos 2207042/2207051) vira pausa só do Instagram (15 → 30 → 60 → 120 min, volta ao normal após publicações bem-sucedidas), sem erro. Na pausa o WhatsApp do “ambos” sai no horário e o Instagram sai sozinho depois, sem duplicar o WhatsApp; Grupo e Status 2 seguem normais. Espaço mínimo entre publicações do Instagram (padrão 3 min, configurável pelo gestor), até no “Agora mesmo”.
- Token vencido ou sem permissão: pausa do Instagram e aviso ao gestor, sem marcar dezenas de itens como erro; reconectar o token encerra a pausa. Instabilidade do Instagram (rede/5xx): espera curta com tentativas limitadas. “Enviando” preso há mais de 30 min é recuperado sozinho, sem reenviar o que pode já ter saído no WhatsApp/Grupo.
- Fila: faixa discreta “Saúde das postagens” por canal, item “Aguardando pausa do Instagram” com horário previsto e botão do gestor “Retomar Instagram agora”.

## [7.55.7] - 2026-11-05

- Seleção de mídias inteiras permite escolher o início do lote e reestruturar a fila seguinte, mantendo canais juntos, ordem e intervalos, com comparação atômica e backup privado.
- Antecipar uma mídia insere seu bloco no horário viável escolhido, afastando os seguintes em vez de saltar para amanhã por falta de espaço.
- Repostagem preserva a origem da mídia e o intervalo editorial. Seletor de horários e chips acomodam telas estreitas com texto ampliado.


## [7.55.6] - 2026-11-05

- Fotos da Esteira preserva o contexto de trabalho: atualização explícita, sem reconstrução por timer, retomada ou conclusão em segundo plano.
- Pessoas editam descrições e observações dos próprios registros; Admin total edita todos, com histórico e proteção contra conflitos.
- Buscadores da Esteira iniciam em Ativas, permitem mudar a situação e filtrar por preço mínimo e máximo.


## [7.55.5] - 2026-11-05

- Recibos Wafly ausentes (404/REQUEST_NOT_FOUND) preservam a incerteza e o identificador original, sem liberar reenvio automático por ausência de recibo.


## [7.55.4] - 2026-11-05

- Alterar Horário ou Próximo livre calcula e grava um horário comum para todos os destinos pendentes da mesma mídia, incluindo registros antigos identificáveis. Evita que um canal fique16:00 e outro16:33 por ajustes separados.
- Reorganização da fila alinha os canais por origem; modo explícito de prioridade atende mídias parcialmente pendentes antes das ainda não iniciadas, com simulação e backup privado recuperável.
- Preserva publicados, envios em confirmação, pausas e intervalos; concorrência recusa a alteração inteira em vez de mover só alguns destinos. Nenhuma recuperação automática de erros históricos.


## [7.55.3] - 2026-11-05

- Agendamento da mesma mídia compartilha horário e intervalo entre Story, Grupo 1 e os dois Status, respeitando a fila e os mínimos de todos os destinos selecionados.
- Mantém partes de vídeo em ordem, recibos e gravação atômica dos destinos.


## [7.55.2] - 2026-11-05

- Status 2 verifica disponibilidade da agenda antes de enviar. Enquanto a Wafly não confirma contatos/privacidade, preserva as postagens agendadas e os horários, sem novos envios nem IDs de tentativa.
- Recusa `AUDIENCE_UNAVAILABLE` deixa de virar espera por recibo e erro 404; o teste de conexão informa a indisponibilidade da agenda mesmo com WhatsApp conectado.
- Instagram, grupo, Status 1 e comprovantes existentes preservados. Recuperação da agenda depende da Wafly; não significa que publicações reais foram retomadas.

## [7.55.1] - 2026-11-05

- Inclui JavaScript e CSS de permissões na lista pública do build. Omissão desses arquivos causava404 no RH após a publicação7.55.0.
- Build passa a recusar HTML com scripts/estilos locais ausentes; monitor de produção também confere os arquivos do RH. Jornada validada a partir do diretório preparado para publicação.

## [7.55.0] - 2026-11-05

- Nova aba Permissões no RH: criar, renomear e configurar acessos compartilhados, com exclusão por substituição e exceções individuais preservadas.
- Esteira passa a usar pessoas ativas com acesso à área para conferência e rodízio diário; Postador e Fotos IA recebem permissões próprias.
- RH mais compacto, com navegação, filtros e perfis expansíveis. Ativação completa depende da publicação manual de RH3.31 e catálogo4.30.


## [7.54.4] - 2026-11-05

- Separa credenciais dos Workers da zona DNS; confere decisões de estoque e mantém o funcionamento atual.


## [7.54.2] - 2026-11-04

- Corrige pré-checagem que exigia Node indevidamente para suítes autônomas em Python.
- Estabiliza a verificação da ordem de fotos no teste: aguarda a revalidação assíncrona, mantendo a mesma ordem exigida; base HTTP explícita para execução isolada.


## [7.54.1] - 2026-11-04

- Corrige falhas HTTP nos feeds, evita consultas simultâneas duplicadas e amplia monitor e testes do Worker OG.


## [7.54.0] - 2026-11-04

- Esteira: envios duráveis em segundo plano, acompanhamento e retomada por etapas, preservando a tarefa atual.
- Buscas Esteira/IA com produtos ao abrir, fotos recentes e características; IA com Cima, Baixo e Look.

## [7.53.5] - 2026-11-04

- Monitor público somente leitura e proteção verificável dos arquivos internos antigos; diagnóstico preciso do cache.


## [7.53.4] - 2026-11-04

- Confiabilidade interna: distribuição estática restrita, testes privados diretos e proteção contra repetição de pedidos


## [7.53.3] - 2026-11-04

- Status WhatsApp com referência real, seleção opcional de canais vinculados, Esteira com atualização por blocos e preparo das peças recebidas em Fotos IA preservando o lote anterior.


## [7.53.2] - 2026-11-03

- Gestão: ações de lote sempre visíveis, Separar na grade e envio das peças selecionadas para modelo IA, sem iniciar geração.


## [7.53.1] - 2026-11-03

- Retomada segura de postagens pendentes, limites por destino e fila sem bloqueio entre canais


## 7.53.0 — 03/11/2026
- **Fotos com IA ganhou página própria:** `fotos-ia.html`, acessível pela Gestão. Um editor por foto, com pessoas explícitas, look completo ou cima/baixo, referências do cadastro/aparelho, poses individuais, posição do grupo e direção visual TENKiTER. A mesma peça pode ser usada intencionalmente em pessoas diferentes. Opções avançadas ficam recolhidas, sem controles duplicados de quantidade.
- **Lotes recuperáveis:** rascunho IndexedDB por conta, edição e novas combinações durante o envio, estados de recebimento/criação/aprovação separados. Clique duplo e resposta perdida não repetem o pedido; confirmação por identidade antes de reenviar. Arquivos ainda não recebidos retomam ao reabrir a página. Os limites de referências e disponibilidade dos motores são informados antes do envio.
- **Correção do erro no envio dos lotes:** a estrutura específica de Fotos IA é verificada mesmo quando o marcador genérico do banco já está atualizado. Migração aditiva testada sobre banco antigo, preservando registros. Claim atômico no D1 impede processamento simultâneo do mesmo pedido. Erros não expõem SQL e explicam a confirmação necessária.
- **Resultados e catálogo:** histórico paginado e filtrado no servidor, aprovação, comparação sem substituir original, capa/galeria por produto e produto misto com vínculos e preços das peças. Atualização da fila preserva digitação e formulários abertos. Idade, público, tamanho e posição das peças são conferidos no cadastro pelo servidor e prevalecem sobre o estilo.
- **Validação:** jornadas simuladas de lote, falha parcial/resposta perdida, uso no produto e vitrine; banco SQLite real para migração/concorrência; mobile/desktop, 320 px, texto 130%, altura 470 e axe. Evidências e limites em `docs/ux/fotos-ia-pagina-20261103.md`. Nenhuma geração paga nem publicação a clientes realizada como teste. APK e Apps Script preservados.


## 7.52.0 — 03/11/2026
- **Esteira → pedir fotos do jeito que quer** (pedido do Pablo). Na conferência, "Pedir foto nova" virou **"Pedir fotos"** com opções prontas para tocar (várias de uma vez): **No pano**, **No manequim**, **Das outras cores/estampas** e **Outro (escrever)**, que abre um campo de texto; observação opcional. Também dá para pedir pela aba nova **Fotos** ("Pedir fotos de uma peça", com a busca do catálogo). Sem opção, ou "Outro" sem texto, a tela avisa em português e nada é gravado.
- **O pedido vira uma tarefa só de fotos** (`est_tarefa` com `origem='pedido_fotos'`, colunas aditivas `detalhe` e `op`). O cartão mostra só a foto atual (toque abre todas + "Ver no site"), nome/código, o que foi pedido (quem e quando), **Ver no site**, **Editar no cadastro**, **Adicionar fotos** (sobe direto ao servidor de fotos e acrescenta à galeria da peça, como a preparação) e **Feito**. Vários pedidos abertos da mesma peça ficam **no mesmo cartão**, cada um com a sua descrição; "Adicionar fotos" conclui todos de uma vez. Toque duplo/reenvio não duplica (op do aparelho) e o mesmo pedido aberto não se repete. Aparece na aba Fotos e no Hoje de quem está em Fotos; não aparece mais na Preparação (lá fica só "N peças com fotos pedidas → Ver na aba Fotos"). Aceitar a peça para o site não dispensa pedido de fotos. Conferência antiga sem opções continua criando "Foto nova".
- **Caixa de fotos da equipe** (aba Fotos). Qualquer pessoa da equipe envia **várias fotos de uma vez** (câmera ou galeria, até 20 por envio) com **descrição por foto e/ou para todas** e, se souber, liga a uma **peça do catálogo**. As fotos sobem ao servidor de fotos (R2) e ficam guardadas no aparelho (IndexedDB, sem senha nem dados de pessoas) até o servidor confirmar: **envio interrompido retoma** pelo "Tentar de novo" ou sozinho ao voltar para a aba Fotos, sem repetir foto (op idempotente). Foto repetida na mesma escolha fica de fora; repetida de outro envio entra com o aviso "Repetida — igual a uma enviada por X em dd/mm". Tabela nova `est_caixa` (só `CREATE TABLE IF NOT EXISTS`).
- **"Fotos recebidas" para o gestor** (Admin total e quem tem permissão de cadastrar peças): filtros Novas/Usadas/Descartadas, quem enviou e quando, descrições, peça indicada e repetidas. Escolhendo fotos: **Colocar num produto** (acrescenta à galeria, sugere a peça indicada, capa opcional, avisa peça arquivada e o limite de 8 fotos; conta como foto nova da peça), **Cadastrar produto novo** (abre a Gestão em outra aba já com as fotos — **um produto** com todas, ou **vários produtos** pelo "Cadastrar vários produtos" da 7.50.0, onde cada foto vira um produto e **"Unir fotos"** junta as do mesmo produto; as fotos entram pelo endereço, sem subir de novo; ficam "Em cadastro" e, quando cada produto é salvo, viram "Usada" com a peça criada) e **Descartar** (confirmação no botão; "Voltar para a caixa" desfaz descarte e cadastro não feito). Quem não cadastra vê só as próprias fotos e o que já foi usado. Arquivo novo `admin-caixa-fotos.js` (Gestão); no `admin.html`, o "Cadastrar vários produtos" aceita fotos que já estão no servidor (`window.tkVariasComFotos`) e `admin-instagram.js` ignora os avisos das fotos da caixa.
- **Preparação sem o bloco de instruções** ("Peça nova passa por aqui… 1… 2… 3…" saiu): fica o título, "Colocar peça em preparação" e a lista. Textos encurtados: busca de colocar ("Arquivada fica fora do site até ser aceita."), "Outras tarefas" sem parágrafo, tarefa de cadastro com uma linha.
- **Corrigido: "Cadastro conferido" duplicada na peça em preparação.** Causa: ao recolocar em preparação uma peça que já tinha passado por ela (aceita e colocada de novo) ou com dois toques simultâneos em "Preparar", `/esteira/preparar` inseria outra vez todas as tarefas do modelo; a leitura mostrava a feita da rodada anterior e a pendente nova. Agora cada título do modelo existe uma vez por peça (inserção condicional na mesma transação; a feita continua feita e a dispensada volta a pendente). Duplicatas antigas ficam **escondidas na leitura** (Preparação e Hoje), sem apagar nada do banco.
- Aba **Fotos** na Esteira (ponto discreto no celular quando há pendência). Service worker `tk-3.52.0`.
- Testes: `tests/worker_esteira_fotos.js` e `tests/esteira_fotos_ui.py` (novos, no CI e no `rodar_tudo.py`); `tests/esteira_ui.py` ajustado. Evidência em `docs/ux/esteira-fotos-20261103/`.

## [7.51.0] - 2026-11-03

- Fotos com IA: lotes por foto, fotos aprovadas nos produtos, composições vinculadas e comparação de motores Cloudflare.


## 7.50.0 — 03/11/2026
- **Cadastrar vários produtos com uniões** (pedido do Pablo). Toque em **"🔗 Unir fotos"**, marque as fotos que são do mesmo produto e toque em **"Unir N fotos"**: o grupo vira **um produto só** com essas fotos (a 1ª marcada é a capa; "Trocar capa" e "Desfazer" no próprio grupo). Grupos ganham borda colorida e número (G1, G2…); as outras fotos continuam soltas. O contador diz **"Vão ser criados N produtos"** (soltas + grupos) e o botão vira "Cadastrar N produtos". Cada grupo é **um** envio da fila assíncrona (capa + galeria, opId próprio), aproveitando o pré-envio — nada sobe de novo. Funciona por toque e por teclado (Espaço/Enter marcam).
- **"Juntar produtos repetidos" em segundo plano** (Gestão e loja). A janela fecha na hora e um aviso discreto mostra "Juntando 3 peças em TK-0821…" e depois **"Pronto: TK-0821 ficou com 6 fotos; 2 arquivadas."** ou o erro em português com **"Tentar de novo"**. A fila fica no aparelho (`fila-lote.js`, IndexedDB `tenkiter_lote_fila_v1`, sem credencial) e retoma depois de recarregar, com o mesmo opId (Web Locks evita duas abas repetindo). Usa a ação `juntarProdutos` que já existia; o Apps Script não mudou.
- **"Separar"** em produto com mais de 1 foto (menu ⋯ do card e "Mais ações" com uma peça marcada): prévia **"Vai virar 6 produtos"**, escolha entre **unir os novos numa família** (nova, ou a família atual da peça) ou **deixar soltos**. A original fica com a 1ª foto (e o vídeo); cada foto extra vira um produto com as mesmas informações (`create` com opId próprio, depois `update` da original, depois `/familias/ligar` com `juntar:true`). Roda em segundo plano, com progresso real ("2 de 5 novos"), e retoma de onde parou sem duplicar. Exige servidor 4.19+ (opId). Substitui o botão antigo que chamava uma ação inexistente (`separarProduto`).
- **Login instantâneo entre a loja e a Gestão:** quem já entrou num lado aparece logado **na hora** no outro (`sessao-rapida.js`: guarda só nome, perfil, nível e permissões presos a uma impressão da sessão — nunca senha, token ou telefone). O servidor confere por trás; se a sessão não valer mais, desloga com aviso ("Sua sessão terminou neste aparelho. Entre de novo para continuar."). Até a confirmação, excluir de vez, Conexões, Importar planilha, Avisos e Configurações ficam escondidos. `common.js` não mudou (APK).
- **Card da Gestão mostra quantas fotos a peça tem** ("📷 6" na miniatura, como a vitrine).
- **Minha seleção:** tocar na miniatura ou no nome do item abre a peça (por cima da seleção; voltar retorna a ela).
- **"Cadastrar peça" saiu do "O que fazer agora"** — o botão laranja "+ Cadastrar" logo abaixo já faz isso.
- Testes: `tests/gestao_unioes.py` (novo, 390 e 1440), `tests/juntar_admin.py` (segundo plano, recarregar no meio, erro e tentar de novo), `tests/selecao_botoes.py` e `tests/listas_so_admin.py` ajustados; simulação (`tests/mock.py`) do `juntarProdutos` mais fiel, ids próprios por produto criado e respostas seguradas para provar que a tela não espera. Evidência em `docs/ux/gestao-unioes-20261103.md`.

## 7.49.0 — 03/11/2026
- **Postagens: cada foto da peça sabe quando foi postada** (pedido do Pablo: "quero ver qual foi postado e qual não"). Conta qualquer canal; publicado e "Publicado sem confirmação" contam, feito à mão também; agendado, erro e cancelado não. A postagem nova guarda as fotos **originais** do catálogo que usou (coluna aditiva `postagem.fotos_origem`), inclusive as que entraram numa **colagem** ou num modelo/recorte que gera imagem nova; "Repostar" leva junto. Postagens antigas (sem esse registro) casam por endereço igual e, quando a mídia foi transformada, pela posição da foto na mesma peça — nada além disso é suposto.
- **Seleção de fotos no postador:** fotos já postadas vêm **desmarcadas** com o selo em texto **"Postada hoje" / "Postada há N dias"** (também no nome acessível); as não postadas vêm marcadas como antes (Feed escolhe a primeira não postada). Dá para marcar uma postada e usar normalmente (modelo, colagem etc.). Se todas já foram postadas, aparece o aviso "Todas as fotos desta peça já foram postadas (a mais recente há N dias)" e nada fica pré-marcado.
- **Lista de peças do postador:** sinal discreto por peça — "2 fotos novas para postar", "Tudo já postado há 5 dias" ou "Foto ainda não postada".
- **Foto nova sobe na ordem "mais recentes"** (vitrine e lista do postador). Só inclusão de foto conta (preço, nome, tamanho, estoque, reordenar ou trocar a capa por uma foto que já existia não contam; recorte de foto antiga no ✂ Enquadrar também não). Escolhendo outra ordem (nome, preço, novidades…), vale a escolha. Fonte da data: tabela `foto_catalogo` no Worker, alimentada pela Gestão ao salvar (`/esteira/toque` agora leva as fotos que entraram) e por comparação das fotos do catálogo (retrato diário e, no máximo a cada 15 min, quando o mapa público expira). Nada muda no Apps Script.
- **Rota pública `GET /catalogo/fotos-novas`** (só id da peça → data da última foto nova, cache de 5 min no KV e 60 s no navegador). A vitrine usa cache local + limite de 2,5 s: com o Worker fora ou lento, fica exatamente como antes. Rota com sessão `GET /post/fotos-postadas` para o postador.
- Arquivo novo `fotos-novas.js` (vitrine e painel). Service worker `tk-3.49.0`.
- Testes: `tests/worker_fotos_postadas.js` e `tests/fotos_postadas_ui.py` (novos, no CI e no `rodar_tudo.py`). Evidência em `docs/ux/fotos-postadas-20261102/`.

## 7.48.3 — 02/11/2026
- **Postagens no WhatsApp (Wafly) proativas** (decisão do Pablo). Quando a Wafly não confirma, o sistema consulta a cada ~1 min por até 10 min; sem resposta definitiva, marca **"Publicado sem confirmação"** (publicado, com aviso discreto em texto e ícone na Fila e em Já postadas) e a fila segue na ordem. Se a Wafly disser que não publicou (estado de falha ou recibo 404), reenvia **uma vez** logo em seguida com ID novo (`-r1`); se falhar de novo, fica em erro com o motivo em português e sai do fluxo automático — nada atrasado é publicado sozinho horas depois.
- **"Instagram + WhatsApp" não espera mais o WhatsApp:** o Instagram publica no horário e o Status 1 é acompanhado em paralelo, com estado próprio (colunas novas `zap_*`, aditivas; nenhum dado migrado ou apagado).
- **"Repostar"** (também para "Publicado sem confirmação") agenda no próximo horário livre do mesmo canal, depois das que já estão agendadas, e a tela informa o horário. No "ambos", reposta só o canal que não saiu ("Repostar só o WhatsApp", "Repostar só o Story" ou os dois). "Tentar de novo" virou "Postar agora mesmo assim" (opção secundária).
- **"Consultar resultado" sempre responde:** mostra o que a Wafly disse e a hora da consulta ("A Wafly ainda não confirmou (consultado às 18:05)", "Confirmado", "A Wafly diz que não publicou: reenviando agora"), com estado de carregamento. Postagens antigas presas (ex.: 916 e 927) só mudam quando alguém toca em Consultar/Repostar; o Instagram que não saiu nunca é publicado fora da vez.
- **Fila → Por canal:** um grupo por canal; o "Instagram + WhatsApp" aparece no grupo do Story e no WhatsApp Status 1, cada um com o estado do seu canal; contagens, "Marcar", intervalo e "próx." contam só aquele canal.
- **Fila → Por mídia:** ▲▼, Horário, Próximo livre, Postar agora (urgente) e Cancelar ficam numa barra no topo do card aberto e valem para todos os destinos da mídia, no mesmo horário; "Opções do canal" saiu. Cada destino mostra só canal, horário e estado; ações por destino aparecem só quando aquele destino precisa (consultar, repostar, descartar).
- **Já postadas:** mesmos modos da Fila (Por mídia / Por canal) e filtro por data e horário (Todos, Hoje, Ontem, 7 dias, Dia e hora).
- Testes: `tests/worker_zap_proativo.js` (novo), `tests/postagens_zap_proativo_ui.py` (novo); `worker_ig.js`, `worker_canal.js` e testes de fila ajustados à regra nova. Evidência em `docs/ux/postagens-zap-proativo-20261102.md`.

## 7.48.2 — 02/11/2026
- **Postagens → Fila → Por mídia em cards recolhidos** (pedido do Pablo). Cada mídia original começa fechada num card compacto com miniatura, tipo (foto, vídeo, carrossel com nº de fotos, vídeo com nº de partes), ordem na fila, próximo horário, autoria e um chip por destino com o estado em texto e ícone (horário agendado, Enviando, Publicado, Erro, Falta postar, Fila de conversão/Convertendo). Tocar no card (ou Enter/Espaço) mostra os destinos completos, as opções do canal e as ações de sempre. Aberto/fechado é preservado quando a fila se atualiza sozinha e ao alternar com "Por canal", sem pular a rolagem.
- **Miniatura vazia corrigida:** a imagem do card era criada sem `src` e preenchida com `atribSrc(img, url)`, mas `atribSrc` só devolve o texto `src="…"` para HTML — nada era aplicado e sobrava um quadrado branco. Agora a miniatura sai com `atribSrc` no próprio HTML. Vídeo usa o pôster `.jpg` do mesmo nome; se ele não existir (vídeos de Postagens no Worker de mídia não têm pôster), mostra o primeiro quadro do vídeo. Vídeo ainda em conversão mostra "Em processo" com ícone; mídia sem prévia mostra "Sem prévia" — nunca um quadrado vazio. O mesmo plano B vale para as miniaturas da visão "Por canal".
- Teste novo `tests/postagens_fila_midia_cards.py` (390 e 1440); `tests/postagens_fila_midia.py` abre o card antes de usar as ações. Evidência em `docs/ux/postagens-fila-midia-20261102.md`.

## 7.48.1 — 02/11/2026
- **Só o Admin total cria ou escreve nomes de categorias, tamanhos, cores e tecidos** (pedido do Pablo). Quem cadastra sem ser Admin total só escolhe o que já existe:
  - **Tecido (cadastro):** o campo não aceita escrever; toca-se num tecido cadastrado (toque de novo tira). O Admin total continua escrevendo e gerenciando nomes.
  - **"Não achei: criar tamanho novo" e "criar cor/estampa nova":** só aparecem para o Admin total (a criação também é recusada se chamada por fora).
  - **Edição em lote:** sem "Criar" para tamanho, cor ou categoria nova; avisa "Só o Admin total cria nomes novos".
- Teste novo `tests/listas_so_admin.py` (funcionária e Admin, 390 e 1440).

## 7.48.0 — 02/11/2026
- **Esteira — conferência sem quantidade obrigatória:** "Quantas peças você contou?" virou opcional. Em branco, a conferência é registrada e o estoque do site fica como está. O servidor recusa quantidade que não seja número inteiro, com aviso em português.
- **Fotos em tela cheia:** tocar na foto da peça (conferência, Hoje, cartão de família, Preparação, Outras tarefas, Painel e itens de pedido) abre todas as fotos e o vídeo da peça no visualizador do site, com **"Ver no site"** (peça ativa, outra aba). A galeria vem do catálogo público que a Esteira já lê.
- **"Editar no cadastro":** conferência, Preparação e Outras tarefas levam à edição normal da peça na Gestão (`admin.html?editar=<ID>`). O link espera a pessoa entrar e a lista carregar; sem permissão de cadastrar, peça inexistente ou link quebrado, mostra aviso legível.
- **Preparação mais clara:** passos do fluxo no topo; cada peça tem o quadro **"Dados do cadastro"** (fotos, nome, código, preço, categoria, público, tamanhos, cores, tecido, estoque, descrição), aberto enquanto falta conferir cadastro/cores e tamanhos. Tarefas do Hoje e Outras tarefas ficam agrupadas por peça, com foto, código, categoria, cores, tamanhos, estoque e quem pediu.
- **Fornecedores:** cadastro com nome (obrigatório), endereço e até 3 telefones (DDD + número). No "Novo pedido", o fornecedor é escolhido da lista (com busca quando a lista é grande), com "Cadastrar fornecedor" (já escolhe o novo) e "Editar dados". O pedido guarda o id do fornecedor e o nome; pedidos antigos com nome digitado continuam iguais. Só o Admin total (mesma permissão dos pedidos).
- **Busca no catálogo com filtros discretos** (Pedidos → Peça do catálogo, Preparação e Painel → colocar na lista): situação (ativas, esgotadas, arquivadas, todas), categoria e público. Escolher a categoria lista sem digitar; quando a peça está em outra situação, o aviso diz para trocar o filtro.
- **Nada de texto livre para categoria, público, tamanhos, cores e tecido na Esteira:** produto novo do pedido e "veio a mais" usam seleções com todas as opções da Gestão (categorias, públicos, tamanhos e cores do catálogo; tecidos do cadastro de tecidos). Valor antigo fora da lista aparece marcado e precisa ser trocado. O Worker confere de novo (`/esteira/listas`) e recusa nome que não existe; se as listas não responderem, não bloqueia.
- Worker: tabela `est_fornecedor`, colunas `est_pedido.fornecedor_id` e `est_pedido_item.tecido` (criadas sem mexer nos dados existentes).

## 7.47.1 — 02/11/2026
- **Família na edição:** tocar na foto de outra peça da família abre a edição daquela peça.
- **Lista da Gestão:** cards de peças com família mostram o selo "Família · N peças".
- **Ligar como família não liga de novo o que já tem família.** Se alguma peça marcada já está numa família, a janela mostra qual e em qual família, e só deixa continuar depois de escolher:
  - "Tirar desta seleção" (a peça fica onde está);
  - "Tirar da família" (com segundo toque; a peça fica livre para a família nova);
  - ou "Juntar todas na família …" (quando é uma família só).
  - Se todas já estão juntas, avisa que não há nada para ligar.
  - O servidor também recusa a ligação sem essa escolha.
- Corrigido: Esc na janela de famílias fechava duas vezes e podia sair da Gestão.

## 7.47.0 — 02/11/2026
- **Família de produtos reformulada:** família = o mesmo produto cadastrado em várias peças, que podem mudar por **estampa** ou por tamanho (não só tamanho).
- **Ligar como família só reconhece as peças:** a janela não pede nada (sem nome da família, sem "Tamanho/idade" digitado) e não muda nada nas peças. Mostra foto, nome, código e estoque de cada uma e um botão "Ligar N peças como família". O nome da família vem do nome das peças.
- **Nada é digitado à parte:** tamanho, idade e cor nunca são escritos pela pessoa para a família. Quando o nome já termina em tamanho/idade (ex.: "... P", "... 4 anos"), esse rótulo é aproveitado automaticamente; nas estampas o rótulo fica vazio e a foto identifica cada peça.
- **"+ Nova variação desta família"** (antes "+ Novo tamanho"): o cadastro vem igual à peça original, inclusive o nome; fotos, tamanhos, cores e quantidade vêm vazios. Sem campo extra obrigatório.
- **Sugestões de famílias** também juntam peças com o nome igual (estampas), além das que só mudam o tamanho no fim do nome.
- **Vitrine:** "Outros tamanhos" virou **"Outras opções"**, com a foto de cada peça (e o tamanho embaixo quando o nome traz); esgotada fica apagada.
- **Gestão (edição):** a caixa Família mostra a foto de cada peça, com a atual marcada.
- **Esteira:** o cartão da família mostra a foto de cada peça (e o tamanho, se houver) e conta "N peças".
- Famílias já ligadas continuam como estão (nenhuma migração ou exclusão).

## 7.46.1 — 02/11/2026
- Esteira: Limpeza, Caixa, Fotos e Atendimento online já vêm com instruções iniciais (editáveis em Configurações; campo vazio volta ao texto inicial).
- Testes atualizados ao comportamento atual: agendamento (aviso dentro da gaveta, assinatura no texto, anexos antes dos atalhos) e retomada do app (clipe abre a gaveta nativa 2.4.22).

## 7.46.0 — Mensageiro: clipe do app abre a gaveta de anexos estilo WhatsApp (Android 2.4.22) — 02/11/2026
- **No app (2.4.22 / code 29)**, tocar no clipe abre direto uma gaveta nativa, sem o menu intermediário de 3 opções:
  - primeiro quadrado "Câmera" + grade das fotos e vídeos recentes do aparelho, com seleção múltipla numerada na ordem do toque (até 30), duração nos vídeos e botão "Enviar (N)";
  - atalhos "Galeria completa" (seletor do sistema, vários arquivos) e "Áudio de arquivo" (mesma função de antes);
  - câmera dentro do app (CameraX 1.4.1): toque tira foto, segurar grava vídeo (ou alterna Foto/Vídeo), troca frontal/traseira, flash/luz, prévia com Refazer/Enviar.
- **Qualidade dentro dos limites atuais**: vídeo MP4 H.264 Full HD 1080p/30 a 2,8 Mbps (HD 720p se o aparelho não tiver 1080p) com contador e parada automática antes de 15 MB (~40 s); opção "HD · até 1:35" para vídeos longos. Foto na maior resolução do sensor, JPEG 95, girada e só reduzida se passar de 5 MB (limite de imagem da Wafly/WhatsApp); o site não a reduz de novo.
- Tudo entra no mesmo seletor `#ms-arquivo`: prévia, legenda, fila de vários anexos, preparo de vídeo e envio continuam os do site. Nada é enviado pela gaveta.
- Permissões pedidas na hora do uso, com acesso parcial do Android 14 ("Liberar mais fotos"); se negar, abre o seletor do sistema. Enquanto espia (sem atender), câmera e áudio ficam bloqueados com aviso.
- Site no navegador/computador e apps antigos (sem `TKAndroid.gavetaAnexo`) mantêm o menu de 3 opções.
- Validação em aparelho físico pendente.

## 7.45.0 — Esteira: lista focada por categoria, gestor altera as listas, reativação de peça parada e painel completo (entrega 5) — 02/11/2026
- **Lista focada por categoria** (`estMontarListas_`, padrão ligado): cada funcionária recebe os 20 itens concentrados numa categoria principal do dia.
  - Categorias ranqueadas pela soma das pontuações dos 20 itens mais urgentes de cada uma (família = 1 item; exclusões de sempre).
  - Pessoas diferentes ficam com categorias diferentes; rodízio entre dias pela tabela nova `est_foco (data, whats, categoria)`: a categoria de ontem pesa ×0,2, anteontem ×0,45, até 6 dias ×0,75.
  - Categoria fixa por pessoa (Configurações) é respeitada. Faltando itens, completa com a próxima categoria mais urgente, agrupada, evitando o foco das outras.
  - Desligado, a montagem é a de antes. A aba Hoje mostra "Categoria do dia".
- **Gestor altera as listas** (Admin total, Painel → "Ver e alterar a lista"): tirar, colocar (busca no catálogo; família entra inteira), mover para outra pessoa, trocar a categoria do dia (refaz só os não conferidos) e refazer a lista. Item já conferido não sai. Rotas `POST /esteira/lista/tirar|colocar|mover|categoria|refazer`.
- **Reativação de peça parada:**
  - O cron (a cada minuto) faz só uma leitura no KV; uma vez por dia, depois da hora configurada (padrão 6h de Fortaleza, com trava e data no KV e no D1), tira um retrato do catálogo público: `est_estoque (produto, data, estoque)` só quando o estoque muda, retratos com mais de 120 dias apagados.
  - `est_produto.ult_queda_em` muda quando o estoque cai; queda explicada por conferência não conta como venda.
  - Dias parado = hoje − maior data entre última queda, cadastro, aceite e início da observação (1º retrato). Família avaliada junta. Fora: peça em preparação, sem estoque informado ou com estoque 0.
  - Degraus configuráveis (padrão 30/60/90): tarefa "Foto nova" (30) e "Vídeo curto" (60) para Fotos, origem `reativacao`, uma vez por período parado e sem duplicar tarefa aberta. 60+: "Sugerir para Postagens" (só aviso). 90+: "Sugestões de promoção/combinação". O sistema nunca muda preço; "Dispensar por 30 dias" (`POST /esteira/reativacao/dispensar`).
- **Painel completo:** listas por pessoa; "Chegaram e não foram para o site" (preparação há mais de 3 dias); "Esperando Aceitar para o site"; pedidos a caminho (com atraso) e esperando aprovação; peças paradas por degrau e tarefas de reativação abertas; diferença por fornecedor (chegadas de 180 dias, tabela com rolagem própria).
- **Configurações:** foco por categoria, categoria fixa por pessoa, degraus da reativação e hora do retrato (salvamento parcial preserva o resto).
- Testes: `worker_esteira.js` 183 ok; `esteira_ui.py` 221 ok.

## 7.44.0 — Família de produtos (Esteira, entrega 4) — 01/11/2026
- **Família de produtos:** a loja cadastra o mesmo modelo uma vez por tamanho ou idade ("Sunga infantil masculino P", "... M", "... G"). Cada tamanho continua um produto separado, com fotos, estoque e link próprios. Agora esses produtos ficam ligados numa família. A planilha e o Apps Script não mudam: a ligação fica no D1 do instagram-worker (`fam_familia`, `fam_membro`).
- **Servidor (instagram-worker):**
  - `GET /familias` é pública (sem sessão, com CORS das demais rotas). Devolve só id, nome e membros (produto, rótulo, ordem), com cache de 5 min no KV e 60 s no navegador/borda. O cache é limpo a cada mudança.
  - Rotas para `catalogo_cadastrar` ou `gerir_acessos`: `POST /familias/ligar`, `/familias/membro`, `/familias/desligar` (família com uma peça só é desfeita), `/familias/ignorar` e `GET /familias/sugestoes`.
  - As sugestões agrupam peças do catálogo com o mesmo nome depois de tirar o tamanho/idade do fim (PP…EXG, G1–G4, U/Único, 1–16, 34–56, "N anos", "N meses", RN, "Tam N", "Nº N"), ignorando acento e caixa. Só entram grupos de 2 ou mais que ainda não são família.
- **Gestão (admin.html + admin-familias.js):**
  - Na edição da peça aparece a família, com **"+ Novo tamanho desta família"** e **"Tirar da família"** (com segundo toque para confirmar).
  - "+ Novo tamanho" abre o cadastro já preenchido a partir da peça, pelo fluxo de duplicar: nome sem o tamanho e o campo **"Tamanho/idade desta peça"**, que completa o nome final. Fotos, tamanhos, cores e quantidade ficam vazios. Se a peça original ainda não tem família, o formulário também confirma o tamanho dela.
  - Quando o cadastro dá certo, a peça nova entra na família. Se o servidor das famílias estiver fora, a ligação fica guardada no aparelho e é refeita na próxima abertura da Gestão.
  - Seleção em lote: **"Ligar como família"**. A janela sugere o nome da família e o tamanho/idade de cada peça para conferir.
  - **"Sugestões de famílias"** (botão no topo da lista): grupos com fotos e tamanhos, com "Ligar" ou "Ignorar". Ignorar vale para toda a equipe.
- **Vitrine (catalogo.js):** continua um card por tamanho, mas os cards da mesma família ficam sempre lado a lado, na ordem da família. O bloco entra na posição do primeiro membro na ordenação atual. Filtros e busca valem por produto: se só parte dos tamanhos passa, aparecem só esses, ainda juntos.
  - Na peça aberta, **"Outros tamanhos: P · M · G"** leva aos irmãos.
  - `/familias` tem limite de 2,5 s e cache local de 10 min. Se falhar ou demorar, a vitrine fica como antes. A primeira pintura nunca espera essa resposta. Quando a lista chega depois, a grade só é reorganizada se a pessoa ainda está no topo e sem janela aberta; nos outros casos, isso fica para a próxima renderização.
- **Esteira:**
  - Na lista diária, a família conta como 1 dos 20 itens e vai inteira para a mesma pessoa. A pontuação da família é a do membro mais urgente. Tamanho conferido ou atualizado à mão há pouco continua fora; os outros vêm juntos.
  - Na aba Hoje, a família aparece num cartão com os tamanhos dentro. A conferência continua por tamanho, e a família só conta como feita quando todos os tamanhos dela foram conferidos.
  - O progresso "X/20" e o Painel contam a família como 1 (`est_lista.familia`).

## 7.43.0 — Esteira de Produtos (entrega 3: Pedidos, chegada com contagem cega e aprovação) — 01/11/2026
- Nova aba **Pedidos** na esteira.html. Admin total monta o pedido ao fornecedor: fornecedor, previsão de chegada, fotos do pedido (só ela vê) e itens. Cada item é **reposição** de peça do catálogo (busca por nome ou código) ou **produto novo** (nome, categoria, público, preço de venda, tamanhos, cores e fotos do fornecedor), com quantidade e **custo unitário**. O editor soma as peças e o custo. "Salvar e marcar como enviado" deixa o pedido "a caminho".
- **Chegada (equipe):** "Chegou mercadoria" lista os pedidos a caminho. Na **contagem cega**, a pessoa não vê nem a quantidade pedida nem o custo. Ela digita o que contou e o sistema responde na hora "Bateu com o pedido" ou "Não bateu com o pedido", com "Recontar" ou "Confirmar". Também há "Não veio" e "+ Veio um modelo que não está aqui" (nome, quantidade e foto pela câmera ou galeria, pelo mesmo envio da entrega 2). O botão "Enviar para a Karla aprovar" só funciona com tudo contado e as diferenças confirmadas.
- **Aprovação (Admin total):** mostra só as diferenças (faltou, sobrou, não veio, veio a mais) e "N itens vieram certos". A decisão é por item:
  - faltou ou não veio: aceitar o que veio ou cobrar o fornecedor;
  - sobrou: ficar com tudo ou devolver a sobra;
  - veio a mais: incluir no estoque (com custo, categoria e público) ou devolver.
- **"Aprovar e liberar para preparação":**
  - **Reposição:** a quantidade aceita é somada ao estoque, pelo update completo do catálogo.
  - **Produto novo:** é criado com a mesma ação `create` do painel (a foto do fornecedor vira a capa; o custo nunca vai à planilha), arquivado logo em seguida (`bulkUpdate` arquivar) e colocado em **Preparação**. Só aparece no site depois de "Aceitar para o site".
  - Cada passo fica registrado por item no servidor (`/esteira/pedidos/aplicado`). Se algo falhar, a tela diz o que foi feito e o que falta, e oferece "Tentar de novo" item a item, sem duplicar: o produto criado fica guardado, o create leva um `opId` por item, e a soma de estoque guarda o valor de partida.
  - No fim, a tela mostra o resumo do que cobrar e do que devolver ao fornecedor.
- **Aba Hoje:** a equipe vê o aviso "Chegou pedido para conferir". O Admin vê "Chegada esperando aprovação" e o aviso de itens aprovados que ainda não foram ao catálogo.
- **Servidor (instagram-worker, bloco Esteira):**
  - tabelas `est_pedido` e `est_pedido_item` (com as colunas extras `fotos` no pedido e `aplic` no item);
  - rotas `/esteira/pedidos*`;
  - as respostas para quem não é Admin total são montadas por lista branca, sem `custo` nem `qtd_pedida`. O teste comprova isso.
- No celular do Admin, as 5 abas usam nomes curtos ("Preparo", "Ajustes"); o nome completo continua no leitor de tela.

## 7.42.0 — Esteira de Produtos (entrega 2: Preparação) — 01/11/2026
- Nova aba **Preparação** na esteira.html (toda a equipe vê): cada peça em preparação mostra foto, nome, progresso e o checklist de tarefas com "Feito", observação curta e "Desfazer".
- Tarefas padrão (editáveis em Configurações → Tarefas da preparação): Cadastro conferido, 1ª foto, Fotos de detalhe, Foto no manequim, Conferir cores e tamanhos — cada uma com a função que faz. Quem está na função do dia marca; Admin total e quem tem "Aceita para o site" marcam qualquer uma.
- Tarefa de foto: "Adicionar fotos" (câmera ou galeria) sobe pelo mesmo servidor de fotos do painel (`tenkiter-midia` /u) e acrescenta à galeria da peça pelo pacote completo do `update` (peça sem foto: a primeira vira capa).
- **Aceitar para o site** (Admin total ou marca "aceita"), com confirmação no próprio botão: peça arquivada é reativada no catálogo (`bulkUpdate` reativar) antes de registrar; peça já ativa só é marcada. O que faltava fica dispensado.
- "Colocar peça em preparação" com busca por nome/código no catálogo; tarefa avulsa por peça.
- Aba **Hoje** ganha "Tarefas da sua função". "Pedir foto nova" na conferência cria a tarefa "Foto nova" para quem está em Fotos.
- Servidor: tabela `est_tarefa`, colunas novas em `est_produto` (`etapa`, `aceito_em`, `aceito_por` e referência do nome/foto) por ALTER seguro; rotas `/esteira/preparacao`, `/preparar`, `/tarefa`, `/tarefa-nova`, `/aceitar`; Configurações aceitam salvamento parcial (`modelosPreparacao`).





## [7.41.1] - 2026-11-01

- Individuais/Grupos fixos em Em atendimento e Todos; grupos internos entram direto em atendimento e não são encerrados nem contam nas regras de clientes.
- Pendentes destacados por quantidade e espera, usando a meta do canal e animação breve com movimento reduzido respeitado.
- Busca geral inclui encerrados, ignora os filtros da lista e agrupa todos os canais pela identidade, preservando homônimos separados e situação por conversa. Resultados adicionais têm paginação explícita.

## 7.41.0 — Esteira de Produtos (entrega 1) — 01/11/2026
- Nova página independente **esteira.html** (mesmo login do site e do Mensageiro): tela **Hoje** com 20 peças por funcionária para conferir ao longo do dia, função do rodízio com instruções e escala do dia.
- Escolha das peças por pontuação (nunca conferida, dias sem conferência, antiguidade, dias sem atualização, estoque baixo, diferença anterior), agrupando categoria/público para facilitar achar na arara; peça conferida ou atualizada à mão nos últimos 21 dias fica de fora; listas não se repetem entre as funcionárias.
- Conferir peça: mostra cadastro, última atualização e última conferência; contagem com aviso quando difere do site; tirar tamanhos/cores que acabaram; pedir foto nova. O que mudar é salvo no produto pelo mesmo caminho da edição em lote.
- Painel (Admin total): progresso de cada uma, diferença site × loja em 30 dias e idade das peças. Configurações (só Admin total): equipe marcada à mão (confere, rodízio, atendente, aceita para o site), escala padrão da semana + troca manual do dia, funções e instruções, peças por pessoa, dias sem repetir e pesos.
- Gestão e Disponibilidade rápida avisam a Esteira quando fotos, tamanhos, cores ou estoque mudam à mão (preço e descrição não contam).
- Servidor: rotas `/esteira/*` e tabelas `est_*` no D1; catálogo lido da lista pública (cache 10 min). Testes: `tests/worker_esteira.js`, `tests/esteira_ui.py`.

## [7.40.45] - 2026-11-01

- Mensageiro com topo e seções compactos, filtros sob demanda e indicação dos filtros ativos; responsável e histórico deixam de disputar espaço com o telefone.
- Homônimos mantêm o telefone visível para identificação; detalhes completos seguem na conversa. A ordem da fila e a alternância de layouts permanecem iguais.
- No APK, a navegação web respeita a área já reservada pela Activity, evitando uma segunda reserva inferior. Conteúdo remoto, sem novo APK.

## [7.40.44] - 2026-11-01

- Histórico de relacionamento discreto nos cards e conversas para o atendente, no site e APK; detalhes distinguem ocorrências registradas dos eventos que contam para a nota.
- A ordem da fila e as regras de pontuação permanecem iguais.

## [7.40.43] - 2026-11-01

- Gestão com tempos observados, disponibilidade, filtros de espera e ações sem contar entradas no aplicativo.
- Pontuação explicável para retomadas; regras configuráveis de cortesia e retorno ao atendimento anterior.
- Lista com não respondidos acima, canais vinculados juntos e visual contínuo opcional no site e APK.


## [7.40.42] - 2026-10-31

- Central do gestor do Mensageiro com dados reais e configurações; fila por mídia e intervalo entre vídeos originais.


## [7.40.41] - 2026-10-31

- Vídeos selecionados juntos são preparados em segundo plano, com progresso por original, retomada automática do rascunho e inclusão das partes em ordem. A configuração da postagem continua livre durante o preparo.

## [7.40.40] - 2026-10-31

- Preparação de vídeo com progresso de envio, estados claros, bloqueio de repetição e recuperação sem reenviar o original.


## [7.40.39] - 2026-10-31

- Vídeos completos divididos em partes ordenadas; regra exclusiva para continuidade sem intervalo e câmera Android com tamanho controlado.


## [7.40.38] - 2026-10-31

- Processador de vídeo com identificação HTTP explícita; ações de gestão ocultas para atendentes e campos de regras com alvo de 48 px.


## [7.40.37] - 2026-10-31

- Encaminhamento com busca completa, paginação, voltar/Escape e preservação do rascunho; retry não reutiliza citação na próxima mensagem.
- Seleção múltipla preserva fotos válidas mesmo quando um vídeo é recusado ou cancelado.
- Vídeos do Mensageiro usam a mesma regra no WhatsApp e Instagram, preservando a duração; Postagens prepara uma mídia comum de 3–30 s para Status, Grupo e Story, com escolha explícita do trecho e prévia antes de usar.
- Preparação privada sem conversor pago automático; é possível fechar e recuperar o resultado selecionando o mesmo original.
- Equipe/fila atualizam sem recarga manual; painel aceita Todos, separa encerramento de resposta e informa horários/cobertura dos indicadores.
- Android 2.4.13/code 20: câmera acessível por Gravar vídeo, galeria múltipla preservada e atualizador/manifesto vinculados à release assinada. Homologação em aparelho físico permanece pendente.


## [7.40.36] - 2026-10-30

- **Responder uma mensagem específica** na conversa: cada bolha (do cliente e sua) tem a ação **Responder**, que abre uma faixa de prévia acima do compositor com **autor + trecho citado** e um **X** para cancelar
- No **WhatsApp** a resposta sai como **citação nativa**: a mensagem vai com o id da citada (`messageId` no `/send-text` da Wafly), então o cliente vê no app dele exatamente a que mensagem você respondeu
- No **Instagram** a citação vai **dentro do texto**, como `> trecho citado` — a API não tem citação nativa. Se houver foto/vídeo junto, o painel avisa: o Instagram não aceita texto com mídia, então mande a citação numa mensagem só de texto
- A citação aparece **também no histórico do painel**, na bolha enviada, ao recarregar a página — o vínculo (id citado, autor e trecho) é gravado na própria mensagem
- Só dá para citar mensagem **da mesma conversa**: citar mensagem de outra conversa é recusado com aviso, e um envio sem id real (incerto) não inventa `messageId`
- Cabeçalho e as **quatro abas** intactos; a ação fica na linha da hora e respeita alvo de toque de 44px no celular, onde não existe hover
- A **gaveta de Produtos** passou a escrever os tamanhos como a equipe fala: `P · M · G` no cartão e `P, M, G` na mensagem
- `ESQUEMA_` em `20261030-citar-6`; testes novos `tests/worker_citar_mensagem.js` e `tests/mensagens_citacao_ui.py` (320/390/1440 com axe) rodando no CI

## [7.40.35] - 2026-10-30

- Painel de Mensagens reorganizado em **quatro abas de fluxo**: Em atendimento, Pendentes, Todos e Encerrados
- **Pendentes é só leitura**: a conversa abre em modo espiar e o compositor só libera depois de tocar em **Atender**, que move a conversa para Em atendimento já com o responsável
- **Encerrados voltam sozinhos**: se o cliente escrever numa conversa encerrada, ela volta para Pendentes com todo o histórico, **sem** responsável atribuído automaticamente e com um aviso explicando a reabertura
- **Em atendimento** tem filtro **Todos / Só meus** e o atalho **Só não respondidos**
- **Todos** mostra o que não está encerrado; **Encerrados** é o histórico
- O canal (WhatsApp 1, WhatsApp 2, Instagram) deixou de ser aba e virou **filtro** na mesma linha — os filtros antigos (grupos, notas, não lidas, retomada) continuam no painel Filtros
- Nada indicado desapareceu: não lidas, tempo sem resposta, canal de origem, responsável, espiar e assumir continuam visíveis
- Cabeçalho com a mesma altura no Android; as quatro abas não quebram palavra nem cortam texto, mesmo com fonte em 200%

## [7.40.34] - 2026-10-30

- Nova conversa **envia pelo WhatsApp**: a loja escreve primeiro pelo WhatsApp 1 ou 2 (número com DDD) usando a integração já existente, com as credenciais só no servidor (Conexões)
- O envio usa o mesmo caminho de uma resposta normal: reserva por idLocal, recibo do provedor e bolha gravada — toque duplo não manda duas vezes
- Instagram continua **apenas abrindo** a conversa: a API oficial não permite que a loja escreva primeiro, e o campo de mensagem nem aparece nesse canal
- Campos da gaveta empilhados (rótulo em cima, campo embaixo): "WhatsApp com DDD" e "Mensagem" deixam de ser cortados em tela estreita
- Totais da equipe com plural correto ("1 encerramento", "3 respostas")

## [7.40.33] - 2026-10-30

- Equipe e atividade: presença aproximada (2 minutos), totais por pessoa e trilha das ações confirmadas — retomado do #305
- Nova conversa: abre conversa por WhatsApp (número com DDD) ou por @ do Instagram que já escreveu para a loja, sem enviar nada
- A trilha guarda a ação e o cliente, nunca o texto da mensagem; ação que falha não entra na trilha


## [7.40.32] - 2026-10-30

- Filas de espera e atendimento com Todos/Meus sem aumentar o cabeçalho


## [7.40.31] - 2026-10-30

- Agendar com anexos, Acompanhar em horas úteis e painel de agendamentos


## [7.40.22] - 2026-10-28

- Disponibiliza Android 2.4.5 assinado: retomada, Voltar, áudio nativo e seletor visual


## [7.40.21] - 2026-10-28

- Corrige retomada da sessão, Voltar da notificação e prepara áudio e seletor visual nativos no Android 2.4.5


## [7.40.20] - 2026-10-28

- Disponibiliza Android 2.4.4 com assinatura preservada e manifesto conferido


## [7.40.19] - 2026-10-28

- Notas da equipe em Espiar, filtro Com notas, acessos por ferramenta, downloads e filtros de produtos no atendimento


## [7.40.18] - 2026-10-28

- App Mensagens: Voltar após abrir por notificação permanece na lista e ignora respostas atrasadas; aba Instagram não herda filtros ocultos de grupos ou etiquetas do WhatsApp


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
